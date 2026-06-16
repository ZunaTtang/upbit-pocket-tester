#!/usr/bin/env bash
# One-shot launcher for macOS/Linux/Git-Bash. Runs uvicorn + vite together.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; echo "[setup] .env 생성됨 — APP_SECRET 를 바꾸세요."; }

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "[setup] 백엔드 가상환경 생성..."
  python3 -m venv "$ROOT/backend/.venv"
fi
"$ROOT/backend/.venv/bin/python" -m pip install -q --upgrade pip
"$ROOT/backend/.venv/bin/python" -m pip install -q -r "$ROOT/backend/requirements.txt"

[ -d "$ROOT/frontend/node_modules" ] || ( cd "$ROOT/frontend" && npm install )

echo "백엔드 : http://127.0.0.1:8000/api/health"
echo "프론트 : http://localhost:5173"

trap 'kill 0' EXIT
( cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 --reload ) &
( cd "$ROOT/frontend" && npm run dev ) &
wait
