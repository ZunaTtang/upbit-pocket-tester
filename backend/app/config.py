"""Application configuration loaded from the project-root .env file.

Everything that touches a secret stays on the backend; nothing here is ever
serialized to the frontend.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# project root = .../upbit-pocket-tester  (two levels up from this file's app/ dir)
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


class Settings:
    # Secret used to derive the Fernet key that encrypts API secret_keys at rest.
    # MUST be set in .env for any persistence to be meaningful.
    APP_SECRET: str = os.getenv("APP_SECRET", "change-me-in-dotenv-please")

    # Upbit REST base. Override in .env if Upbit changes hosts.
    UPBIT_BASE_URL: str = os.getenv("UPBIT_BASE_URL", "https://api.upbit.com")

    # SQLite file location.
    DB_PATH: str = os.getenv("DB_PATH", str(ROOT_DIR / "data" / "workbench.db"))

    # Backend bind.
    HOST: str = os.getenv("BACKEND_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

    # Frontend dev origin allowed for CORS.
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # Upstream request timeout (seconds).
    REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "15"))


settings = Settings()
