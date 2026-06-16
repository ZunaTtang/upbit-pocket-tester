"""FastAPI app: API-key management, presets, call logs, settings, and the single
signed proxy that every Upbit call flows through.

Safety gates enforced here (not just in the UI):
  - global read-only mode blocks any non-GET upstream call
  - global / per-call dry-run returns the signed request without sending it
  - per-kind amount caps block oversized order/withdraw/transfer requests
"""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db, upbit
from .config import settings

app = FastAPI(title="Upbit Pocket Tester — backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------

class KeyIn(BaseModel):
    label: str
    access_key: str
    secret_key: str
    pocket_type: str = "main"
    permissions: list[str] = []


class KeyUpdate(BaseModel):
    label: str
    pocket_type: str = "main"
    permissions: list[str] = []
    secret_key: Optional[str] = None  # only set to rotate the secret


class PresetIn(BaseModel):
    name: str
    endpoint_id: str
    method: str
    path: str
    params: dict[str, Any] = {}
    note: str = ""


class PresetUpdate(BaseModel):
    name: str
    params: dict[str, Any] = {}
    note: str = ""


class VerifyIn(BaseModel):
    checklist: dict[str, bool] = {}
    note: str = ""


class Guard(BaseModel):
    cap_key: str           # which setting holds the cap (e.g. limit_order_krw)
    amount: str            # decimal string to compare
    label: str = ""        # human label for the messages


class ProxyIn(BaseModel):
    key_id: Optional[int] = None
    method: str
    path: str
    params: dict[str, Any] = {}
    authenticated: bool = False
    write: bool = False
    dry_run: bool = False
    endpoint_id: str = ""
    label: str = ""
    guard: Optional[Guard] = None


# ---------------------------------------------------------------------------
# meta / settings
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"ok": True, "base_url": settings.UPBIT_BASE_URL}


@app.get("/api/meta")
def meta():
    return {"base_url": settings.UPBIT_BASE_URL}


@app.get("/api/settings")
def read_settings():
    return db.get_settings()


@app.put("/api/settings")
def write_settings(patch: dict):
    return db.update_settings(patch)


# ---------------------------------------------------------------------------
# api keys
# ---------------------------------------------------------------------------

@app.get("/api/keys")
def get_keys():
    return db.list_keys()


@app.get("/api/keys/active")
def active_key():
    return db.get_active_key()


@app.post("/api/keys")
def add_key(body: KeyIn):
    return db.create_key(body.label, body.access_key, body.secret_key,
                         body.pocket_type, body.permissions)


@app.put("/api/keys/{key_id}")
def edit_key(key_id: int, body: KeyUpdate):
    res = db.update_key(key_id, body.label, body.pocket_type,
                        body.permissions, body.secret_key)
    if res is None:
        raise HTTPException(404, "key not found")
    return res


@app.delete("/api/keys/{key_id}")
def remove_key(key_id: int):
    db.delete_key(key_id)
    return {"ok": True}


@app.post("/api/keys/{key_id}/activate")
def set_active(key_id: int):
    res = db.activate_key(key_id)
    if res is None:
        raise HTTPException(404, "key not found")
    return res


# ---------------------------------------------------------------------------
# presets
# ---------------------------------------------------------------------------

@app.get("/api/presets")
def get_presets():
    return db.list_presets()


@app.post("/api/presets")
def add_preset(body: PresetIn):
    return db.create_preset(body.name, body.endpoint_id, body.method,
                            body.path, body.params, body.note)


@app.put("/api/presets/{preset_id}")
def edit_preset(preset_id: int, body: PresetUpdate):
    res = db.update_preset(preset_id, body.name, body.params, body.note)
    if res is None:
        raise HTTPException(404, "preset not found")
    return res


@app.delete("/api/presets/{preset_id}")
def remove_preset(preset_id: int):
    db.delete_preset(preset_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# logs
# ---------------------------------------------------------------------------

@app.get("/api/logs")
def get_logs(q: str = "", limit: int = 200):
    return db.list_logs(q, limit)


@app.get("/api/logs/{log_id}")
def get_log(log_id: int):
    res = db.get_log(log_id)
    if res is None:
        raise HTTPException(404, "log not found")
    return res


@app.post("/api/logs/{log_id}/verify")
def save_verify(log_id: int, body: VerifyIn):
    res = db.set_log_verify(log_id, {"checklist": body.checklist, "note": body.note})
    if res is None:
        raise HTTPException(404, "log not found")
    return res


@app.delete("/api/logs")
def wipe_logs():
    db.clear_logs()
    return {"ok": True}


@app.get("/api/identifier")
def new_identifier(prefix: str = "wb"):
    return {"identifier": db.gen_identifier(prefix)}


# ---------------------------------------------------------------------------
# the signed proxy — every Upbit call goes through here
# ---------------------------------------------------------------------------

def _check_guard(guard: Optional[Guard], current: dict) -> Optional[str]:
    if guard is None:
        return None
    cap_raw = str(current.get(guard.cap_key, "0"))
    try:
        cap = Decimal(cap_raw)
        amt = Decimal(str(guard.amount))
    except (InvalidOperation, ValueError):
        return None  # un-parseable -> don't block on garbage; UI validates too
    if cap > 0 and amt > cap:
        return (f"금액 상한 초과: {guard.label or guard.cap_key} 값 {amt} 이(가) "
                f"설정된 상한 {cap} 을(를) 초과했습니다. (설정 탭에서 조정)")
    return None


@app.post("/api/proxy")
async def proxy(body: ProxyIn):
    current = db.get_settings()
    method = body.method.upper()
    is_write = body.write or method != "GET"

    key_label = ""
    access_key = secret_key = None
    if body.key_id is not None:
        creds = db.get_key_secret(body.key_id)
        if creds is None and body.authenticated:
            raise HTTPException(400, "선택된 API 키를 찾을 수 없습니다.")
        if creds:
            access_key, secret_key = creds
        ak = db.get_active_key()
        if ak and ak["id"] == body.key_id:
            key_label = ak["label"]

    base_log = {
        "endpoint_id": body.endpoint_id,
        "label": body.label,
        "key_id": body.key_id,
        "key_label": key_label,
        "method": method,
        "params_json": json.dumps(body.params, ensure_ascii=False),
    }

    # --- gate 1: read-only --------------------------------------------------
    if current.get("read_only") and is_write:
        msg = "읽기 전용 모드가 켜져 있어 쓰기(GET 외) 호출이 차단되었습니다."
        preview = upbit.build_preview(method, body.path, body.params,
                                       body.authenticated, access_key, secret_key)
        log_id = db.insert_log({**base_log, "url": preview["url"],
                                "request_query": preview["query_string"],
                                "request_body": json.dumps(preview["body"], ensure_ascii=False)
                                if preview["body"] is not None else "",
                                "dry_run": False, "error": msg})
        return {"log_id": log_id, "blocked": True, "reason": msg,
                "dry_run": False, "request": preview, "response": None}

    # --- gate 2: amount cap -------------------------------------------------
    guard_err = _check_guard(body.guard, current)
    if guard_err:
        preview = upbit.build_preview(method, body.path, body.params,
                                       body.authenticated, access_key, secret_key)
        log_id = db.insert_log({**base_log, "url": preview["url"],
                                "request_query": preview["query_string"],
                                "request_body": json.dumps(preview["body"], ensure_ascii=False)
                                if preview["body"] is not None else "",
                                "dry_run": False, "error": guard_err})
        return {"log_id": log_id, "blocked": True, "reason": guard_err,
                "dry_run": False, "request": preview, "response": None}

    # --- gate 3: dry-run (global or per-call) -------------------------------
    if body.dry_run or current.get("dry_run"):
        preview = upbit.build_preview(method, body.path, body.params,
                                       body.authenticated, access_key, secret_key)
        log_id = db.insert_log({**base_log, "url": preview["url"],
                                "request_query": preview["query_string"],
                                "request_body": json.dumps(preview["body"], ensure_ascii=False)
                                if preview["body"] is not None else "",
                                "dry_run": True})
        return {"log_id": log_id, "blocked": False, "dry_run": True,
                "request": preview, "response": None}

    # --- live call ----------------------------------------------------------
    try:
        result = await upbit.execute(method, body.path, body.params,
                                     body.authenticated, access_key, secret_key)
    except Exception as exc:  # network / signing failure
        log_id = db.insert_log({**base_log, "url": settings.UPBIT_BASE_URL + body.path,
                                "dry_run": False, "error": str(exc)})
        return {"log_id": log_id, "blocked": False, "dry_run": False,
                "request": None, "response": None, "error": str(exc)}

    req, resp = result["request"], result["response"]
    log_id = db.insert_log({
        **base_log,
        "url": req["url"],
        "request_query": req["query_string"],
        "request_body": json.dumps(req["body"], ensure_ascii=False) if req["body"] is not None else "",
        "dry_run": False,
        "status": resp["status"],
        "latency_ms": resp["latency_ms"],
        "remaining_req": resp["remaining_req"],
        "response_body": json.dumps(resp["body"], ensure_ascii=False),
    })
    return {"log_id": log_id, "blocked": False, "dry_run": False,
            "request": req, "response": resp}
