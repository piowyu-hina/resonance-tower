#!/usr/bin/env bash
# Serves prototype/ over HTTP so index.html's <script type="module"> can load
# without hitting the file:// CORS block (see README「本機執行」).
set -euo pipefail

PORT="${1:-8000}"
cd "$(dirname "${BASH_SOURCE[0]}")/prototype"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "找不到 python 或 python3，請自行安裝或改用其他本機 HTTP server。" >&2
  exit 1
fi

echo "伺服器啟動於 http://127.0.0.1:${PORT}/index.html"
exec "$PYTHON" -m http.server "$PORT"
