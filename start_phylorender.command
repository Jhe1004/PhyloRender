#!/bin/zsh
set -e
cd "${0:A:h}"
# Always run this checkout's source; a historical packaged executable may
# contain a different renderer and must not silently take precedence.
exec /usr/bin/python3 tools/local_server.py --port 8765 --open
