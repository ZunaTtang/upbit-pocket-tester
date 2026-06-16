"""Upbit request signing + execution.

JWT is built exactly per Upbit's spec:
  - payload: access_key, nonce(uuid4)
  - when params exist: + query_hash (SHA512 hex of the query string) + query_hash_alg
  - algorithm: HS256, signed with secret_key

Array parameters use the `name[]` convention. The query string used for the
hash is the unquoted form of urlencode(..., doseq=True), matching Upbit's
official examples, and the same encoded params are sent on the wire.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any
from urllib.parse import urlencode, unquote

import httpx
import jwt

from .config import settings


def normalize_params(params: dict[str, Any] | None) -> dict[str, Any]:
    """Drop empties; ensure list-valued params use the `name[]` key form."""
    if not params:
        return {}
    out: dict[str, Any] = {}
    for k, v in params.items():
        if v is None or v == "" or (isinstance(v, list) and len(v) == 0):
            continue
        if isinstance(v, list):
            key = k if k.endswith("[]") else f"{k}[]"
            out[key] = v
        else:
            out[k] = v
    return out


def build_query_string(params: dict[str, Any]) -> str:
    if not params:
        return ""
    return unquote(urlencode(params, doseq=True))


def make_jwt(access_key: str, secret_key: str, params: dict[str, Any]) -> str:
    payload: dict[str, Any] = {
        "access_key": access_key,
        "nonce": str(uuid.uuid4()),
    }
    if params:
        query_string = build_query_string(params).encode("utf-8")
        payload["query_hash"] = hashlib.sha512(query_string).hexdigest()
        payload["query_hash_alg"] = "SHA512"
    return jwt.encode(payload, secret_key, algorithm="HS256")


def _parse_remaining(headers: httpx.Headers) -> str:
    # Upbit returns e.g. "group=default; min=1799; sec=29"
    return headers.get("Remaining-Req", "")


def build_preview(method: str, path: str, params: dict[str, Any],
                  authenticated: bool, access_key: str | None,
                  secret_key: str | None) -> dict:
    """Build the request that *would* be sent (Dry-run / inspection)."""
    method = method.upper()
    norm = normalize_params(params)
    url = settings.UPBIT_BASE_URL.rstrip("/") + path
    query_string = build_query_string(norm)
    headers: dict[str, str] = {"Accept": "application/json"}
    body_repr: Any = None

    if method in ("GET", "DELETE"):
        full_url = url + (f"?{query_string}" if query_string else "")
    else:
        full_url = url
        body_repr = norm

    if authenticated and access_key and secret_key:
        token = make_jwt(access_key, secret_key, norm)
        headers["Authorization"] = f"Bearer {token}"

    return {
        "method": method,
        "url": full_url,
        "query_string": query_string,
        "headers": headers,
        "body": body_repr,
    }


async def execute(method: str, path: str, params: dict[str, Any],
                  authenticated: bool, access_key: str | None,
                  secret_key: str | None) -> dict:
    """Sign (if needed) and send the request. Returns request + response detail."""
    method = method.upper()
    norm = normalize_params(params)
    url = settings.UPBIT_BASE_URL.rstrip("/") + path
    headers: dict[str, str] = {"Accept": "application/json"}

    if authenticated:
        if not access_key or not secret_key:
            raise ValueError("인증이 필요한 호출인데 활성 API 키가 없습니다.")
        token = make_jwt(access_key, secret_key, norm)
        headers["Authorization"] = f"Bearer {token}"

    request_kwargs: dict[str, Any] = {"headers": headers}
    body_repr: Any = None
    if method in ("GET", "DELETE"):
        request_kwargs["params"] = norm
    else:
        request_kwargs["json"] = norm
        body_repr = norm

    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT) as client:
        resp = await client.request(method, url, **request_kwargs)
    latency_ms = int((time.perf_counter() - started) * 1000)

    try:
        parsed = resp.json()
    except Exception:
        parsed = {"_raw": resp.text}

    return {
        "request": {
            "method": method,
            "url": str(resp.request.url),
            "query_string": build_query_string(norm),
            "headers": headers,
            "body": body_repr,
        },
        "response": {
            "status": resp.status_code,
            "latency_ms": latency_ms,
            "remaining_req": _parse_remaining(resp.headers),
            "body": parsed,
        },
    }
