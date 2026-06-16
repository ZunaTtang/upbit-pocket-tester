# One-shot launcher for Windows PowerShell.
# Sets up the backend venv + frontend deps on first run, then opens two windows
# (uvicorn + vite). Run from anywhere:  powershell -ExecutionPolicy Bypass -File start.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
  Copy-Item "$root\.env.example" "$root\.env"
  Write-Host "[setup] .env 생성됨 — APP_SECRET 를 긴 무작위 문자열로 바꾸세요." -ForegroundColor Yellow
}

# --- backend ---------------------------------------------------------------
if (-not (Test-Path "$root\backend\.venv")) {
  Write-Host "[setup] 백엔드 가상환경 생성..." -ForegroundColor Cyan
  python -m venv "$root\backend\.venv"
}
& "$root\backend\.venv\Scripts\python.exe" -m pip install -q --upgrade pip
& "$root\backend\.venv\Scripts\python.exe" -m pip install -q -r "$root\backend\requirements.txt"

# --- frontend --------------------------------------------------------------
if (-not (Test-Path "$root\frontend\node_modules")) {
  Write-Host "[setup] 프론트엔드 의존성 설치..." -ForegroundColor Cyan
  Push-Location "$root\frontend"; npm install; Pop-Location
}

# --- launch ----------------------------------------------------------------
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd '$root\backend'; & '.\.venv\Scripts\Activate.ps1'; uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "백엔드 : http://127.0.0.1:8000/api/health" -ForegroundColor Green
Write-Host "프론트 : http://localhost:5173" -ForegroundColor Green
Write-Host "(두 개의 새 창에서 실행됩니다. 닫으면 종료됩니다.)"
