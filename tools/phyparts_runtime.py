"""Compatibility HTTP jobs for PhyloRender's independent JavaScript engine."""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from process_supervisor import run_managed
from native_jobs import NativeJobs

ENGINE = "PhyloRender-conflict-statistics"
ALGORITHM = "phylorender-conflict-statistics-v2"
ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "phyparts_cli.cjs"
CORE = ROOT / "core" / "phyparts-engine.js"
SAFE_TREE = re.compile(r"^[T0-9(),.;]+$")
TOKEN = re.compile(r"T\d{5}|[(),;]|(?:\d+(?:\.\d*)?|\.\d+)")
REGISTRY = NativeJobs()
JOBS, LOCK, CONTROLS = REGISTRY.jobs, REGISTRY.lock, REGISTRY.controls


def run_cancellable(command, work, log, cancel_event):
    """Retained for compatibility tests and old local callers."""
    return run_managed(command, work, log, cancel_event=cancel_event, timeout=300)


def runtime_ready() -> bool:
    return bool(shutil.which("node")) and CLI.is_file() and CORE.is_file()


def parse_tree(text: str) -> set[str]:
    tokens = TOKEN.findall(text)
    if "".join(tokens) != text.strip():
        raise ValueError("Serialized concordance tree contains unsupported tokens")
    tips = [token for token in tokens if token.startswith("T")]
    if tokens[-1:] != [";"] or len(tips) < 3 or len(set(tips)) != len(tips):
        raise ValueError("Serialized concordance tree is incomplete, has fewer than 3 taxa, or contains duplicates")
    supports = [float(token) for token in tokens if token[0].isdigit() or token[0] == "."]
    if any(value < 0 or value > 1 for value in supports):
        raise ValueError("Branch support values must be normalized to [0, 1]")
    return set(tips)


def validate_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Missing gene-tree concordance parameters")
    species, genes, names = payload.get("species"), payload.get("genes"), payload.get("names")
    threshold, mode = payload.get("threshold", 0), payload.get("mode", "two")
    if mode not in {"two", "four"}:
        raise ValueError('Pie display mode must be "two" or "four"')
    if not isinstance(threshold, (int, float)) or isinstance(threshold, bool) or not 0 <= threshold < 1:
        raise ValueError("Branch support threshold must be >= 0 (no filter) and < 1")
    if not isinstance(names, list) or not 3 <= len(names) <= 1000 or any(
        not isinstance(name, str) or not name.strip() or len(name) > 1000
        or any(char in name for char in "\t\n\r;") for name in names
    ) or len(set(names)) != len(names):
        raise ValueError("Species-tree tip labels are missing, duplicated, or contain delimiter characters")
    if not isinstance(genes, list) or not 1 <= len(genes) <= 20000:
        raise ValueError("Between 1 and 20,000 comparable gene trees are supported per run")
    if sum(len(tree) for tree in genes if isinstance(tree, str)) > 120_000_000:
        raise ValueError("Serialized gene-tree text exceeds the 120 MB safety limit; partial statistics were not used")
    valid = {f"T{index:05d}" for index in range(len(names))}
    for index, tree in enumerate([species, *genes]):
        if not isinstance(tree, str) or not 8 <= len(tree) <= 200000 or not SAFE_TREE.fullmatch(tree):
            raise ValueError(f"Tree #{index} does not use safe internal taxon indices")
        tips = parse_tree(tree)
        if not tips <= valid:
            raise ValueError(f"Tree #{index} contains taxa absent from the species tree")
        if index == 0 and tips != valid:
            raise ValueError("Species tree does not match the taxon index table")
    return {"species": species, "genes": genes, "names": names,
            "threshold": threshold, "mode": mode}


def run_analysis(payload: dict, progress=lambda message: None, cancel_event=None) -> dict:
    if not runtime_ready():
        raise FileNotFoundError("Node.js is unavailable; built-in gene-tree concordance engine cannot start")
    progress(f"Computing rooted bipartition concordance across {len(payload['genes'])} gene trees...")
    with tempfile.TemporaryDirectory(prefix="phylorender-conflict-") as directory:
        work = Path(directory)
        source, output = work / "input.json", work / "result.json"
        source.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        with (work / "process.log").open("w", encoding="utf-8") as log:
            completed = run_managed([shutil.which("node"), str(CLI), str(source), str(output)],
                                    work, log, cancel_event=cancel_event, timeout=300)
        if completed.returncode or not output.is_file():
            raise RuntimeError("Built-in gene-tree concordance analysis failed; check root placement and support values")
        result = json.loads(output.read_text(encoding="utf-8"))
    if result.get("engine") != ENGINE or result.get("algorithm") != ALGORITHM:
        raise RuntimeError("Gene-tree concordance result version mismatch")
    return result


def submit(payload: object) -> str:
    return REGISTRY.submit(validate_payload(payload), run_analysis)


def status(token: str) -> dict:
    return REGISTRY.status(token)


def forget(token: str) -> bool:
    return REGISTRY.forget(token)


def cancel(token: str) -> dict:
    return REGISTRY.cancel(token)
