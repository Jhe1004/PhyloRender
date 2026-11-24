"""Pure request/static-file policy. Local service is deliberately loopback-only."""
from pathlib import Path
from urllib.parse import unquote, urlparse

LOOPBACK = {"localhost", "127.0.0.1", "::1"}
ROOT_ASSETS = {"index.html", "styles.css", "ui-shell.css", "ui-controls.css", "app.js", "agent-bridge.js",
               "cloud-tree.js", "conflict-tree.js", "tree-rooting.js", "time-scale.js",
               "tip-label-mapping.js", "taxon-rank-normalizer.js", "figure-units.js",
               "figure-contract.js", "panel-resize.js"}


def request_allowed(headers, port, *, post=False):
    try:
        host = urlparse("http://" + headers.get("Host", ""))
        if host.hostname not in LOOPBACK or host.username or host.password or host.port != port:
            return False, "HOST_NOT_ALLOWED"
        origin = headers.get("Origin")
        if origin:
            parsed = urlparse(origin)
            if parsed.scheme != "http" or parsed.netloc != host.netloc or parsed.path not in {"", "/"}:
                return False, "ORIGIN_NOT_ALLOWED"
        if headers.get("Sec-Fetch-Site") == "cross-site":
            return False, "ORIGIN_NOT_ALLOWED"
        if post and headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            return False, "JSON_REQUIRED"
        if post and headers.get("Transfer-Encoding"):
            return False, "TRANSFER_ENCODING_NOT_SUPPORTED"
        return True, None
    except (ValueError, TypeError):
        return False, "HOST_NOT_ALLOWED"


def static_allowed(root, request_path):
    relative = unquote(urlparse(request_path).path).lstrip("/") or "index.html"
    parts = Path(relative).parts
    if not parts or any(part.startswith(".") for part in parts):
        return False
    try:
        resolved = (root / relative).resolve()
        resolved.relative_to(root.resolve())
    except (ValueError, OSError):
        return False
    if not resolved.is_file():
        return False
    if relative in ROOT_ASSETS:
        return True
    if parts[0] == "core" and resolved.suffix == ".js" and len(parts) == 2:
        return True
    if parts[0] == "render" and resolved.suffix == ".js" and len(parts) == 2:
        return True
    if parts[0] == "ui" and resolved.suffix == ".js" and len(parts) == 2:
        return True
    if parts[0] == "vendor" and resolved.suffix in {".js", ".css", ".woff", ".woff2", ".ttf"}:
        return True
    return parts[0] == "defaults" and len(parts) == 2 and (
        resolved.suffix in {".js", ".nwk", ".tre"} or resolved.name == "RAxML_bipartitions.Raxml-Chloroplast")
