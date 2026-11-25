"""Compatibility HTTP runtime for PhyloRender's built-in JavaScript PL display aligner."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ENGINE = "PhyloRender-pl-aligner"
ALGORITHM = "phylorender-pl-display-alignment-v1"
ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "pl_align_cli.cjs"
CORE = ROOT / "core" / "pl-aligner.js"
LBFGS = ROOT / "core" / "lbfgs-solver.js"
NEWICK_CHARS = re.compile(r"^[A-Za-z0-9_(),:;.eE+\-]+$")
TIP_ID = re.compile(r"\bT\d{5}\b")


def runtime_ready() -> bool:
    return bool(shutil.which("node")) and CLI.is_file() and CORE.is_file() and LBFGS.is_file()


def validate_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Missing cloudogram display-alignment parameters")
    if payload.get("analysis_kind", "display_alignment") != "display_alignment":
        raise ValueError("This endpoint supports display_alignment only; it cannot perform de novo divergence-time inference")
    age = payload.get("age")
    if not isinstance(age, (float, int)) or isinstance(age, bool) or not 0 < age <= 1_000_000:
        raise ValueError("Fixed root age must be > 0 and <= 1,000,000")
    trees = payload.get("trees")
    if not isinstance(trees, list) or not 1 <= len(trees) <= 100:
        raise ValueError("Between 1 and 100 trees are supported per batch")
    validated_trees = []
    for index, item in enumerate(trees):
        if not isinstance(item, dict):
            raise ValueError(f"Malformed payload for tree #{index + 1}")
        newick = item.get("newick")
        root_tips = item.get("rootTips")
        if not isinstance(newick, str) or not 10 <= len(newick) <= 200_000 or not NEWICK_CHARS.fullmatch(newick) or not newick.endswith(";"):
            raise ValueError(f"Tree #{index + 1} contains unsupported characters or invalid size for penalized-likelihood alignment")
        ids = TIP_ID.findall(newick)
        if len(ids) < 2 or len(ids) != len(set(ids)):
            raise ValueError(f"Tree #{index + 1} has missing or duplicate taxon tokens")
        if not isinstance(root_tips, list) or len(root_tips) != 2 or any(not isinstance(tip, str) or tip not in ids for tip in root_tips) or root_tips[0] == root_tips[1]:
            raise ValueError(f"Tree #{index + 1} has invalid root-calibration taxa")
        calibrations = item.get("calibrations", [])
        if not isinstance(calibrations, list) or len(calibrations) > len(ids) - 2:
            raise ValueError(f"Tree #{index + 1} has an invalid number of shared-clade calibrations")
        seen_pairs = set()
        clean_cals = []
        for cal_index, calibration in enumerate(calibrations):
            if not isinstance(calibration, dict):
                raise ValueError(f"Tree #{index + 1} has a malformed shared-clade calibration")
            tips = calibration.get("tips")
            fixed_age = calibration.get("age")
            if (not isinstance(tips, list) or len(tips) != 2 or
                any(not isinstance(tip, str) or tip not in ids for tip in tips) or
                tips[0] == tips[1] or not isinstance(fixed_age, (float, int)) or
                isinstance(fixed_age, bool) or not 0 < fixed_age < age or
                tuple(sorted(tips)) in seen_pairs):
                raise ValueError(f"Tree #{index + 1} has an invalid shared-clade calibration #{cal_index + 1}")
            seen_pairs.add(tuple(sorted(tips)))
            clean_cals.append({"tips": tips, "age": fixed_age})
        validated_trees.append({"newick": newick, "rootTips": root_tips, "calibrations": clean_cals})
    return {"analysis_kind": "display_alignment", "age": age, "trees": validated_trees}
