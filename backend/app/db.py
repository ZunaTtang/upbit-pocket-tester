"""SQLite persistence: API keys (with encrypted secret), presets, call logs, settings.

A fresh connection is opened per operation (simplest correct pattern under
FastAPI's threadpool). The schema is created on first import.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from .config import settings
from . import crypto

# ---------------------------------------------------------------------------
# connection / schema
# ---------------------------------------------------------------------------

os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS api_keys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    label           TEXT NOT NULL,
    access_key      TEXT NOT NULL,
    secret_key_enc  TEXT NOT NULL,
    pocket_type     TEXT NOT NULL DEFAULT 'main',   -- 'main' | 'sub'
    permissions     TEXT NOT NULL DEFAULT '[]',     -- json array of permission keys
    is_active       INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    endpoint_id  TEXT NOT NULL,
    method       TEXT NOT NULL,
    path         TEXT NOT NULL,
    params       TEXT NOT NULL DEFAULT '{}',
    note         TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS call_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              INTEGER NOT NULL,
    endpoint_id     TEXT NOT NULL DEFAULT '',
    label           TEXT NOT NULL DEFAULT '',
    key_id          INTEGER,
    key_label       TEXT NOT NULL DEFAULT '',
    method          TEXT NOT NULL,
    url             TEXT NOT NULL,
    request_query   TEXT NOT NULL DEFAULT '',
    request_body    TEXT NOT NULL DEFAULT '',
    dry_run         INTEGER NOT NULL DEFAULT 0,
    status          INTEGER,
    latency_ms      INTEGER,
    remaining_req   TEXT NOT NULL DEFAULT '',
    response_body   TEXT NOT NULL DEFAULT '',
    error           TEXT NOT NULL DEFAULT '',
    verify_state    TEXT NOT NULL DEFAULT '',       -- json {checklist:{...}, note:str}
    params_json     TEXT NOT NULL DEFAULT '{}'      -- raw params, for re-run
);

CREATE TABLE IF NOT EXISTS settings_kv (
    k  TEXT PRIMARY KEY,
    v  TEXT NOT NULL
);
"""

DEFAULT_SETTINGS = {
    "read_only": False,
    "dry_run": False,
    "limit_order_krw": "1000000",     # max KRW notional per order
    "limit_withdraw_krw": "100000",   # max KRW per withdraw
    "limit_withdraw_coin": "0",       # 0 = no coin-amount cap
    "limit_transfer": "0",            # 0 = no transfer-amount cap
}


def init_db() -> None:
    with _conn() as conn:
        conn.executescript(SCHEMA)
        cur = conn.execute("SELECT k FROM settings_kv WHERE k='__init__'")
        if cur.fetchone() is None:
            conn.execute("INSERT INTO settings_kv(k, v) VALUES('__init__','1')")
            conn.execute(
                "INSERT OR REPLACE INTO settings_kv(k, v) VALUES('settings', ?)",
                (json.dumps(DEFAULT_SETTINGS),),
            )


# ---------------------------------------------------------------------------
# settings
# ---------------------------------------------------------------------------

def get_settings() -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT v FROM settings_kv WHERE k='settings'").fetchone()
    data = dict(DEFAULT_SETTINGS)
    if row:
        data.update(json.loads(row["v"]))
    return data


def update_settings(patch: dict) -> dict:
    current = get_settings()
    current.update({k: v for k, v in patch.items() if k in DEFAULT_SETTINGS})
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings_kv(k, v) VALUES('settings', ?)",
            (json.dumps(current),),
        )
    return current


# ---------------------------------------------------------------------------
# api keys
# ---------------------------------------------------------------------------

def _key_public(row: sqlite3.Row) -> dict:
    """Key as exposed to the frontend — NEVER includes the secret."""
    return {
        "id": row["id"],
        "label": row["label"],
        "access_key": row["access_key"],
        "pocket_type": row["pocket_type"],
        "permissions": json.loads(row["permissions"]),
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }


def list_keys() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM api_keys ORDER BY id").fetchall()
    return [_key_public(r) for r in rows]


def create_key(label: str, access_key: str, secret_key: str,
               pocket_type: str, permissions: list[str]) -> dict:
    with _conn() as conn:
        # first key becomes active automatically
        count = conn.execute("SELECT COUNT(*) AS c FROM api_keys").fetchone()["c"]
        cur = conn.execute(
            """INSERT INTO api_keys(label, access_key, secret_key_enc, pocket_type,
                                    permissions, is_active, created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (label, access_key, crypto.encrypt(secret_key), pocket_type,
             json.dumps(permissions), 1 if count == 0 else 0, int(time.time())),
        )
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM api_keys WHERE id=?", (new_id,)).fetchone()
    return _key_public(row)


def update_key(key_id: int, label: str, pocket_type: str,
               permissions: list[str], secret_key: Optional[str]) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM api_keys WHERE id=?", (key_id,)).fetchone()
        if row is None:
            return None
        if secret_key:
            conn.execute(
                """UPDATE api_keys SET label=?, pocket_type=?, permissions=?,
                       secret_key_enc=? WHERE id=?""",
                (label, pocket_type, json.dumps(permissions),
                 crypto.encrypt(secret_key), key_id),
            )
        else:
            conn.execute(
                "UPDATE api_keys SET label=?, pocket_type=?, permissions=? WHERE id=?",
                (label, pocket_type, json.dumps(permissions), key_id),
            )
        row = conn.execute("SELECT * FROM api_keys WHERE id=?", (key_id,)).fetchone()
    return _key_public(row)


def delete_key(key_id: int) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM api_keys WHERE id=?", (key_id,))


def activate_key(key_id: int) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM api_keys WHERE id=?", (key_id,)).fetchone()
        if row is None:
            return None
        conn.execute("UPDATE api_keys SET is_active=0")
        conn.execute("UPDATE api_keys SET is_active=1 WHERE id=?", (key_id,))
        row = conn.execute("SELECT * FROM api_keys WHERE id=?", (key_id,)).fetchone()
    return _key_public(row)


def get_active_key() -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM api_keys WHERE is_active=1 LIMIT 1").fetchone()
    return _key_public(row) if row else None


def get_key_secret(key_id: int) -> Optional[tuple[str, str]]:
    """Returns (access_key, secret_key_plaintext) for signing. Backend-only."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT access_key, secret_key_enc FROM api_keys WHERE id=?", (key_id,)
        ).fetchone()
    if row is None:
        return None
    return row["access_key"], crypto.decrypt(row["secret_key_enc"])


# ---------------------------------------------------------------------------
# presets
# ---------------------------------------------------------------------------

def list_presets() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM presets ORDER BY id DESC").fetchall()
    return [
        {**dict(r), "params": json.loads(r["params"])} for r in rows
    ]


def create_preset(name: str, endpoint_id: str, method: str, path: str,
                  params: dict, note: str) -> dict:
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO presets(name, endpoint_id, method, path, params, note, created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (name, endpoint_id, method, path, json.dumps(params), note, int(time.time())),
        )
        row = conn.execute("SELECT * FROM presets WHERE id=?", (cur.lastrowid,)).fetchone()
    return {**dict(row), "params": json.loads(row["params"])}


def update_preset(preset_id: int, name: str, params: dict, note: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM presets WHERE id=?", (preset_id,)).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE presets SET name=?, params=?, note=? WHERE id=?",
            (name, json.dumps(params), note, preset_id),
        )
        row = conn.execute("SELECT * FROM presets WHERE id=?", (preset_id,)).fetchone()
    return {**dict(row), "params": json.loads(row["params"])}


def delete_preset(preset_id: int) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM presets WHERE id=?", (preset_id,))


# ---------------------------------------------------------------------------
# call logs
# ---------------------------------------------------------------------------

def insert_log(entry: dict) -> int:
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO call_logs(ts, endpoint_id, label, key_id, key_label, method,
                   url, request_query, request_body, dry_run, status, latency_ms,
                   remaining_req, response_body, error, verify_state, params_json)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                int(time.time() * 1000),
                entry.get("endpoint_id", ""),
                entry.get("label", ""),
                entry.get("key_id"),
                entry.get("key_label", ""),
                entry.get("method", ""),
                entry.get("url", ""),
                entry.get("request_query", ""),
                entry.get("request_body", ""),
                1 if entry.get("dry_run") else 0,
                entry.get("status"),
                entry.get("latency_ms"),
                entry.get("remaining_req", ""),
                entry.get("response_body", ""),
                entry.get("error", ""),
                entry.get("verify_state", ""),
                entry.get("params_json", "{}"),
            ),
        )
        return cur.lastrowid


def _log_public(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["dry_run"] = bool(d["dry_run"])
    for jf in ("response_body", "request_body"):
        # store raw text; frontend parses. keep as-is.
        pass
    try:
        d["verify_state"] = json.loads(d["verify_state"]) if d["verify_state"] else None
    except Exception:
        d["verify_state"] = None
    try:
        d["params"] = json.loads(d["params_json"]) if d["params_json"] else {}
    except Exception:
        d["params"] = {}
    return d


def list_logs(q: str = "", limit: int = 200) -> list[dict]:
    sql = "SELECT * FROM call_logs"
    args: list[Any] = []
    if q:
        sql += (" WHERE endpoint_id LIKE ? OR label LIKE ? OR url LIKE ? "
                "OR request_body LIKE ? OR response_body LIKE ?")
        like = f"%{q}%"
        args = [like, like, like, like, like]
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    with _conn() as conn:
        rows = conn.execute(sql, args).fetchall()
    return [_log_public(r) for r in rows]


def get_log(log_id: int) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM call_logs WHERE id=?", (log_id,)).fetchone()
    return _log_public(row) if row else None


def set_log_verify(log_id: int, verify_state: dict) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT id FROM call_logs WHERE id=?", (log_id,)).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE call_logs SET verify_state=? WHERE id=?",
            (json.dumps(verify_state), log_id),
        )
    return get_log(log_id)


def clear_logs() -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM call_logs")


def gen_identifier(prefix: str = "wb") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"
