#!/usr/bin/env python3
"""Serve PhyloRender and expose bundled scientific-name tools as a local API."""

from __future__ import annotations

import argparse
import bisect
import errno
import json
import hashlib
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import phyparts_runtime
import pl_align_runtime
from process_supervisor import run_managed, run_captured, ComputationCancelled, shutdown as shutdown_native
from native_jobs import NativeJobs
from http_security import request_allowed, static_allowed, LOOPBACK


PROJECT_ROOT = (Path(sys.executable).resolve().parents[1] if getattr(sys, "frozen", False)
                else Path(__file__).resolve().parents[1])
MAX_LABELS = 5000
MAX_LABEL_LENGTH = 1000
REQUEST_BODY_LIMITS = {
    "/api/cloud-phyparts": 1_000_000_000,
    "/api/cloud-date": 200_000_000,
    "/api/cloud-date/jobs": 200_000_000,
    "/api/taxon-names": 5_000_000,
    "/api/taxon-names/jobs": 5_000_000,
}
TREEPL_NEWICK_CHARS = re.compile(r"^[A-Za-z0-9_(),:;.eE+\-]+$")
TREEPL_TIP_ID = re.compile(r"\bT\d{5}\b")
REQUEST_SLOTS = threading.BoundedSemaphore(2)
DATING_SLOT = threading.BoundedSemaphore(1)
DATING_JOBS = NativeJobs()
TAXON_JOBS = NativeJobs(deadline_seconds=60)
# Optional name recognition must not occupy both admitted-body/analysis slots.
# Rapid imports can leave an earlier helper running after the UI changes tree.
TAXON_SLOT = threading.BoundedSemaphore(1)


def bundled_treepl() -> Path | None:
    if platform.system() == "Darwin" and platform.machine().lower() in {"arm64", "aarch64"}:
        directory = PROJECT_ROOT / "vendor/native/macos-arm64"
        if all((directory / name).is_file() for name in
               ["treePL", "libadolc.2.dylib", "libomp.dylib"]):
            return directory / "treePL"
    if platform.system() == "Linux" and platform.machine().lower() in {"x86_64", "amd64"}:
        # The Docker image compiles the pinned source for its own runtime libraries.
        installed = shutil.which("treePL")
        if installed:
            return Path(installed)
    return None


def run_cloud_dating(payload: object, progress=lambda _: None, cancel_event=None) -> dict[str, object]:
    """Construct a constrained display alignment using the built-in JS engine."""
    clean = pl_align_runtime.validate_payload(payload)
    node_bin = shutil.which("node")
    if not node_bin or not pl_align_runtime.CLI.is_file() or not pl_align_runtime.CORE.is_file():
        raise FileNotFoundError("Node.js or built-in penalized-likelihood display aligner is unavailable")
    if cancel_event is not None and cancel_event.is_set():
        raise ComputationCancelled()
    progress(f"Running penalized-likelihood display alignment across {len(clean['trees'])} tree(s)...")
    with tempfile.TemporaryDirectory(prefix="phylorender-pl-align-") as directory:
        work = Path(directory)
        source, output = work / "input.json", work / "result.json"
        source.write_text(json.dumps(clean, ensure_ascii=False), encoding="utf-8")
        with (work / "engine.log").open("w", encoding="utf-8") as log:
            process = run_managed([node_bin, str(pl_align_runtime.CLI), str(source), str(output)],
                                  work, log, cancel_event=cancel_event, timeout=300)
        if process.returncode != 0 or not output.is_file():
            detail = (work / "engine.log").read_text(errors="replace").strip()[-500:]
            raise RuntimeError(f"Penalized-likelihood display alignment failed: {detail or 'no output produced'}")
        result = json.loads(output.read_text(encoding="utf-8"))
    if cancel_event is not None and cancel_event.is_set():
        raise ComputationCancelled()
    if result.get("engine") != pl_align_runtime.ENGINE or result.get("algorithm") != pl_align_runtime.ALGORITHM:
        raise RuntimeError("Penalized-likelihood display-alignment engine version mismatch")
    return result


def bundled_gnfinder_candidates() -> list[Path]:
    system = platform.system().lower()
    machine = platform.machine().lower()
    binary_dir = PROJECT_ROOT / "tools" / "gnfinder" / "bin"
    names: list[str] = []
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            # GNfinder v1.1.6 publishes an x86_64 macOS binary. It runs on
            # Apple silicon through Rosetta 2.
            names.append("gnfinder-darwin-x86_64")
        else:
            names.append("gnfinder-darwin-x86_64")
    elif system == "linux" and machine in {"x86_64", "amd64"}:
        names.append("gnfinder-linux-x86_64")
    elif system == "windows" and machine in {"x86_64", "amd64"}:
        names.append("gnfinder-windows-x86_64.exe")
    return [binary_dir / name for name in names]


def find_gnfinder() -> Path | None:
    for candidate in bundled_gnfinder_candidates():
        if candidate.is_file():
            return candidate
    installed = shutil.which("gnfinder")
    return Path(installed) if installed else None


def bundled_gnparser_candidates() -> list[Path]:
    system = platform.system().lower()
    machine = platform.machine().lower()
    binary_dir = PROJECT_ROOT / "tools" / "gnparser" / "bin"
    names: list[str] = []
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            names.append("gnparser-darwin-arm64")
        elif machine in {"x86_64", "amd64"}:
            names.append("gnparser-darwin-x86_64")
    elif system == "linux":
        if machine in {"arm64", "aarch64"}:
            names.append("gnparser-linux-arm64")
        elif machine in {"x86_64", "amd64"}:
            names.append("gnparser-linux-x86_64")
    elif system == "windows":
        if machine in {"arm64", "aarch64"}:
            names.append("gnparser-windows-arm64.exe")
        elif machine in {"x86_64", "amd64"}:
            names.append("gnparser-windows-x86_64.exe")
    return [binary_dir / name for name in names]


def find_gnparser() -> Path | None:
    for candidate in bundled_gnparser_candidates():
        if candidate.is_file():
            return candidate
    installed = shutil.which("gnparser")
    return Path(installed) if installed else None


def normalize_labels(payload: object) -> list[str]:
    if not isinstance(payload, dict) or not isinstance(payload.get("labels"), list):
        raise ValueError("Payload must include a 'labels' string array")
    labels = payload["labels"]
    if not labels or len(labels) > MAX_LABELS:
        raise ValueError(f"Number of labels must be between 1 and {MAX_LABELS}")
    normalized: list[str] = []
    for label in labels:
        if not isinstance(label, str):
            raise ValueError("Every item in 'labels' must be a string")
        clean = label.replace("_", " ").replace("\r", " ").replace("\n", " ")
        if len(clean) > MAX_LABEL_LENGTH:
            raise ValueError(f"Individual label length must not exceed {MAX_LABEL_LENGTH} characters")
        normalized.append(clean)
    return normalized


def run_gnfinder(labels: list[str], cancel_event=None) -> dict[str, object]:
    binary = find_gnfinder()
    if binary is None:
        raise FileNotFoundError("Local GNfinder executable not found")

    separator = "\n\n"
    starts: list[int] = []
    cursor = 0
    for index, label in enumerate(labels):
        starts.append(cursor)
        cursor += len(label)
        if index < len(labels) - 1:
            cursor += len(separator)
    input_text = separator.join(labels)

    process = run_captured(
        [str(binary), "-U", "-A", "-f", "compact"],
        input_text=input_text,
        timeout=30,
        cancel_event=cancel_event,
    )
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or f"exit code {process.returncode}"
        raise RuntimeError(f"GNfinder execution failed: {detail}")
    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("GNfinder returned unparseable JSON output") from error

    matches_by_label: list[list[dict[str, object]]] = [[] for _ in labels]
    for match in result.get("names") or []:
        start = match.get("start")
        end = match.get("end")
        if not isinstance(start, int) or not isinstance(end, int):
            continue
        label_index = bisect.bisect_right(starts, start) - 1
        if label_index < 0:
            continue
        label_start = starts[label_index]
        local_start = start - label_start
        local_end = end - label_start
        if local_start < 0 or local_end > len(labels[label_index]) or local_end <= local_start:
            continue
        matches_by_label[label_index].append(
            {
                "start": local_start,
                "end": local_end,
                "verbatim": match.get("verbatim", labels[label_index][local_start:local_end]),
                "cardinality": match.get("cardinality", 0),
            }
        )

    metadata = result.get("metadata") or {}
    return {
        "engine": "gnfinder",
        "version": metadata.get("gnfinderVersion", "unknown"),
        "labels": [
            {"label": label, "matches": matches_by_label[index]}
            for index, label in enumerate(labels)
        ],
    }


def run_gnparser(labels: list[str], cancel_event=None) -> dict[str, object]:
    binary = find_gnparser()
    if binary is None:
        raise FileNotFoundError("Local GNparser executable not found")

    with tempfile.TemporaryDirectory(prefix="phylorender-gnparser-") as directory:
        input_file = Path(directory) / "labels.txt"
        input_file.write_text("\n".join(labels) + "\n", encoding="utf-8")
        process = run_captured(
            [
                str(binary),
                str(input_file),
                "-q",
                "-f",
                "compact",
                "-d",
                "-n",
                "botanical",
            ],
            timeout=30,
            cancel_event=cancel_event,
        )
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or f"exit code {process.returncode}"
        raise RuntimeError(f"GNparser execution failed: {detail}")

    parsed_rows: list[dict[str, object]] = []
    for line in process.stdout.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise RuntimeError("GNparser returned unparseable JSON output") from error
        if isinstance(row, dict):
            parsed_rows.append(row)
    if len(parsed_rows) != len(labels):
        raise RuntimeError(f"GNparser returned {len(parsed_rows)} rows for {len(labels)} input labels")

    safe_rows: list[dict[str, object]] = []
    version = "unknown"
    for label, row in zip(labels, parsed_rows):
        version = str(row.get("parserVersion") or version)
        words: list[dict[str, object]] = []
        for word in row.get("words") or []:
            if not isinstance(word, dict):
                continue
            start = word.get("start")
            end = word.get("end")
            if not isinstance(start, int) or not isinstance(end, int):
                continue
            if start < 0 or end <= start or end > len(label):
                continue
            words.append(
                {
                    "start": start,
                    "end": end,
                    "verbatim": label[start:end],
                    "normalized": word.get("normalized", label[start:end]),
                    "wordType": word.get("wordType", ""),
                }
            )
        safe_rows.append(
            {
                "parsed": bool(row.get("parsed")),
                "quality": row.get("quality", 0),
                "cardinality": row.get("cardinality", 0),
                "rank": row.get("rank"),
                "tail": row.get("tail"),
                "words": words,
            }
        )
    return {"engine": "gnparser", "version": version, "labels": safe_rows}


def run_taxon_name_analysis(labels: list[str], cancel_event=None) -> dict[str, object]:
    matches_by_label: list[list[dict[str, object]]] = [[] for _ in labels]
    parses_by_label: list[dict[str, object] | None] = [None for _ in labels]
    engines: list[str] = []
    versions: dict[str, str] = {}
    errors: list[str] = []

    if find_gnfinder() is not None:
        try:
            finder = run_gnfinder(labels, cancel_event)
            matches_by_label = [item.get("matches", []) for item in finder["labels"]]
            engines.append("gnfinder")
            versions["gnfinder"] = str(finder.get("version", "unknown"))
        except ComputationCancelled:
            raise
        except Exception as error:
            errors.append(str(error))

    if find_gnparser() is not None:
        try:
            parser = run_gnparser(labels, cancel_event)
            parses_by_label = list(parser["labels"])
            engines.append("gnparser")
            versions["gnparser"] = str(parser.get("version", "unknown"))
        except ComputationCancelled:
            raise
        except Exception as error:
            errors.append(str(error))

    if not engines:
        detail = "; ".join(errors) if errors else "Local scientific-name helpers (GNfinder / GNparser) not found"
        raise FileNotFoundError(detail)

    return {
        "engine": "+".join(engines),
        "versions": versions,
        "labels": [
            {
                "label": label,
                "matches": matches_by_label[index],
                "parse": parses_by_label[index],
            }
            for index, label in enumerate(labels)
        ],
        "warnings": errors,
    }


class PhyloRenderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def allowed(self, *, post=False):
        ok, code = request_allowed(self.headers, self.server.server_address[1], post=post)
        if not ok:
            self.close_connection = True
            self.send_json(415 if code == "JSON_REQUIRED" else 403,
                           {"error": code, "code": code, "retryable": False})
        return ok

    def do_HEAD(self):
        if not self.allowed():
            return
        if not static_allowed(PROJECT_ROOT, self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if not self.allowed():
            return
        if re.fullmatch(r"/api/taxon-names/jobs/[A-Za-z0-9_-]{32}", urlparse(self.path).path):
            self.send_json(200, TAXON_JOBS.status(urlparse(self.path).path.rsplit("/", 1)[-1]))
            return
        if re.fullmatch(r"/api/cloud-date/jobs/[A-Za-z0-9_-]{32}", urlparse(self.path).path):
            self.send_json(200, DATING_JOBS.status(urlparse(self.path).path.rsplit("/", 1)[-1]))
            return
        if urlparse(self.path).path.startswith("/api/cloud-phyparts/jobs/"):
            self.send_json(200, phyparts_runtime.status(urlparse(self.path).path.rsplit("/", 1)[-1]))
            return
        if urlparse(self.path).path == "/api/cloud-phyparts/status":
            self.send_json(200, {"available": phyparts_runtime.runtime_ready(),
                                 "engine": phyparts_runtime.ENGINE,
                                 "algorithm": phyparts_runtime.ALGORITHM})
            return
        if urlparse(self.path).path == "/api/cloud-date/status":
            ready = pl_align_runtime.runtime_ready()
            self.send_json(200, {"available": ready, "engine": pl_align_runtime.ENGINE if ready else None,
                                 "algorithm": pl_align_runtime.ALGORITHM,
                                 "platform": f"{platform.system()}-{platform.machine()}"})
            return
        if urlparse(self.path).path == "/api/taxon-names/status":
            finder = find_gnfinder()
            parser = find_gnparser()
            engines = [name for name, binary in (("gnfinder", finder), ("gnparser", parser)) if binary]
            self.send_json(
                200,
                {
                    "available": bool(engines),
                    "engine": "+".join(engines) if engines else "browser-rules",
                    "binaries": {
                        "gnfinder": finder.name if finder else None,
                        "gnparser": parser.name if parser else None,
                    },
                },
            )
            return
        if not static_allowed(PROJECT_ROOT, self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if not self.allowed(post=True):
            return
        endpoint = urlparse(self.path).path
        if re.fullmatch(r"/api/taxon-names/jobs/[A-Za-z0-9_-]{32}/cancel", endpoint):
            self.close_connection = True
            self.send_json(200, TAXON_JOBS.cancel(endpoint.split("/")[-2]))
            return
        if re.fullmatch(r"/api/cloud-date/jobs/[A-Za-z0-9_-]{32}/cancel", endpoint):
            self.close_connection = True
            self.send_json(200, DATING_JOBS.cancel(endpoint.split("/")[-2]))
            return
        if re.fullmatch(r"/api/cloud-phyparts/jobs/[A-Za-z0-9_-]{32}/cancel", endpoint):
            self.close_connection = True
            self.send_json(200, phyparts_runtime.cancel(endpoint.split("/")[-2]))
            return
        if endpoint not in REQUEST_BODY_LIMITS:
            self.send_json(404, {"error": "Endpoint not found"})
            return
        taxon_acquired = False
        if endpoint == "/api/taxon-names":
            taxon_acquired = TAXON_SLOT.acquire(blocking=False)
            if not taxon_acquired:
                self.close_connection = True
                self.send_json(429, {"error": "TAXON_BUSY", "code": "SERVICE_BUSY", "retryable": True})
                return
        if not REQUEST_SLOTS.acquire(blocking=False):
            if taxon_acquired:
                TAXON_SLOT.release()
            self.close_connection = True
            self.send_json(429, {"error": "SERVICE_BUSY", "code": "SERVICE_BUSY", "retryable": True})
            return
        dating_acquired = False
        try:
            length = int(self.headers.get("Content-Length", "0"))
            limit = REQUEST_BODY_LIMITS[endpoint]
            if length <= 0 or length > limit:
                self.close_connection = True
                raise ValueError("Request body is empty or exceeds the maximum allowed size")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if endpoint == "/api/cloud-phyparts":
                self.send_json(202, {"job": phyparts_runtime.submit(payload)})
            elif endpoint == "/api/taxon-names/jobs":
                labels = normalize_labels(payload)
                def execute_names(value, progress, event):
                    if not TAXON_SLOT.acquire(blocking=False):
                        raise ValueError("Scientific-name analysis is already running")
                    try:
                        return run_taxon_name_analysis(value, event)
                    finally:
                        TAXON_SLOT.release()
                self.send_json(202, {"job": TAXON_JOBS.submit(labels, execute_names)})
            elif endpoint == "/api/cloud-date/jobs":
                if not isinstance(payload, dict) or not isinstance(payload.get("trees"), list) or not 1 <= len(payload["trees"]) <= 100:
                    raise ValueError("Between 1 and 100 trees are supported per batch")
                def execute_dating(value, progress, event):
                    if not DATING_SLOT.acquire(blocking=False):
                        raise ValueError("Another treePL computation is already running")
                    try:
                        return run_cloud_dating(value, progress, event)
                    finally:
                        DATING_SLOT.release()
                self.send_json(202, {"job": DATING_JOBS.submit(payload, execute_dating)})
            elif endpoint == "/api/cloud-date":
                dating_acquired = DATING_SLOT.acquire(blocking=False)
                if not dating_acquired:
                    self.send_json(429, {"error": "DATING_BUSY", "code": "SERVICE_BUSY", "retryable": True})
                    return
                self.send_json(200, run_cloud_dating(payload))
            else:
                labels = normalize_labels(payload)
                self.send_json(200, run_taxon_name_analysis(labels))
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except FileNotFoundError as error:
            self.send_json(503, {"error": str(error), "engine": "browser-rules"})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "Local helper execution timed out"})
        except Exception as error:  # keep the local UI usable on helper failure
            self.send_json(500, {"error": str(error)})
        finally:
            if dating_acquired:
                DATING_SLOT.release()
            REQUEST_SLOTS.release()
            if taxon_acquired:
                TAXON_SLOT.release()

    def log_message(self, message: str, *args: object) -> None:
        sys.stderr.write("[PhyloRender] " + message % args + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the local PhyloRender workbench server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="Open PhyloRender in the default browser after startup")
    parser.add_argument("--owner-stdin", action="store_true", help="Private MCP page server: exit when parent control pipe closes")
    args = parser.parse_args()
    if args.host not in LOOPBACK:
        raise SystemExit("Local page service must bind to loopback. Use the authenticated MCP HTTP service for remote access.")
    server = None
    for port in range(args.port, args.port + 10):
        try:
            server = ThreadingHTTPServer((args.host, port), PhyloRenderHandler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    if server is None:
        raise SystemExit(f"Ports {args.port}–{args.port + 9} are all in use; stop existing servers and try again")
    finder = find_gnfinder()
    parser_engine = find_gnparser()
    address = f"http://{args.host}:{server.server_address[1]}/"
    print(f"PhyloRender: {address}")
    tools = [
        description
        for description in (
            f"GNfinder {finder.name}" if finder else "",
            f"GNparser {parser_engine.name}" if parser_engine else "",
        )
        if description
    ]
    print(f"Scientific-name parsing: {' + '.join(tools) if tools else 'built-in browser rules'}")
    if args.open:
        threading.Timer(0.2, webbrowser.open, args=(address,)).start()
    if args.owner_stdin:
        def watch_owner():
            # No PID polling or global process-name kill. Closing this pipe is
            # private-runtime ownership loss, including an abrupt owner crash.
            try:
                sys.stdin.buffer.read(1)
            finally:
                server.shutdown()
        threading.Thread(target=watch_owner, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        shutdown_native()


if __name__ == "__main__":
    main()
