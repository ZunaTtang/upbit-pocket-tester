#!/usr/bin/env bash
# One-shot launcher for macOS / Linux / Git-Bash(Windows). Runs uvicorn + vite together.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; echo "[setup] .env 생성됨 — APP_SECRET 를 바꾸세요."; }

# pick a python launcher (python3 on *nix, python on Windows)
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "Python을 찾을 수 없습니다. Python 3.10+ 설치 후 PATH 에 추가하세요."; exit 1; }

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "[setup] 백엔드 가상환경 생성..."
  "$PY" -m venv "$ROOT/backend/.venv"
fi

# venv python differs by platform: Windows -> Scripts/python.exe, POSIX -> bin/python
if [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then
  VENV_PY="$ROOT/backend/.venv/Scripts/python.exe"
else
  VENV_PY="$ROOT/backend/.venv/bin/python"
fi

"$VENV_PY" -m pip install -q --upgrade pip
"$VENV_PY" -m pip install -q -r "$ROOT/backend/requirements.txt"

[ -d "$ROOT/frontend/node_modules" ] || ( cd "$ROOT/frontend" && npm install )

echo "백엔드 : http://127.0.0.1:8000/api/health"
echo "프론트 : http://localhost:5173"
echo "(종료: Ctrl+C)"

# run both; uvicorn invoked as a module so it works regardless of venv layout
trap 'kill 0' EXIT
( cd "$ROOT/backend" && "$VENV_PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload ) &
( cd "$ROOT/frontend" && npm run dev ) &
wait
