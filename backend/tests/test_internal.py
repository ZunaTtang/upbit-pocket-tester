"""Internal test suite — verifies backend logic WITHOUT any real Upbit call.

All network-bound paths are exercised via dry-run (which signs but never sends),
so running these never touches a real account. Run from the backend/ dir:

    python -m pytest -q
"""
import hashlib
import os
import tempfile

# Point at a throwaway DB and a fixed secret BEFORE importing the app.
_TMPDB = os.path.join(tempfile.gettempdir(), "upbit_tester_unit.db")
for _suf in ("", "-wal", "-shm"):
    try:
        os.remove(_TMPDB + _suf)
    except OSError:
        pass
os.environ["DB_PATH"] = _TMPDB
os.environ["APP_SECRET"] = "unit-test-secret"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app import crypto, upbit  # noqa: E402

client = TestClient(app)
SECRET = "topsecret-must-never-leak"


# --------------------------------------------------------------------------
# unit: crypto + signing
# --------------------------------------------------------------------------
def test_crypto_roundtrip():
    enc = crypto.encrypt("hello-secret")
    assert enc != "hello-secret"
    assert crypto.decrypt(enc) == "hello-secret"


def test_normalize_drops_empties_and_brackets_arrays():
    p = upbit.normalize_params(
        {"market": "KRW-BTC", "states": ["wait", "done"], "blank": "", "nil": None, "empty_list": []}
    )
    assert p == {"market": "KRW-BTC", "states[]": ["wait", "done"]}


def test_query_string_array_encoding():
    qs = upbit.build_query_string(upbit.normalize_params({"states": ["wait", "done"], "market": "KRW-BTC"}))
    assert "states[]=wait" in qs and "states[]=done" in qs and "market=KRW-BTC" in qs


def test_jwt_without_params_has_no_query_hash():
    payload = jwt.decode(upbit.make_jwt("ACC", SECRET, {}), SECRET, algorithms=["HS256"])
    assert payload["access_key"] == "ACC" and "nonce" in payload
    assert "query_hash" not in payload and "query_hash_alg" not in payload


def test_jwt_with_params_query_hash_is_sha512_of_query_string():
    params = upbit.normalize_params({"market": "KRW-BTC", "side": "bid", "states": ["wait"]})
    payload = jwt.decode(upbit.make_jwt("ACC", SECRET, params), SECRET, algorithms=["HS256"])
    expected = hashlib.sha512(upbit.build_query_string(params).encode("utf-8")).hexdigest()
    assert payload["query_hash"] == expected
    assert payload["query_hash_alg"] == "SHA512"


def test_preview_get_builds_querystring_url_and_post_builds_body():
    g = upbit.build_preview("GET", "/v1/orders/chance", {"market": "KRW-BTC"}, True, "ACC", SECRET)
    assert g["url"].endswith("/v1/orders/chance?market=KRW-BTC")
    assert g["headers"]["Authorization"].startswith("Bearer ")
    p = upbit.build_preview("POST", "/v1/orders", {"market": "KRW-BTC", "side": "bid"}, True, "ACC", SECRET)
    assert p["body"] == {"market": "KRW-BTC", "side": "bid"} and "?" not in p["url"]


# --------------------------------------------------------------------------
# integration: API + safety gates (all writes via dry-run, never sent)
# --------------------------------------------------------------------------
@pytest.fixture(scope="module")
def key_id():
    r = client.post("/api/keys", json={
        "label": "unit-main", "access_key": "ACC123", "secret_key": SECRET,
        "pocket_type": "main", "permissions": ["asset_view", "order", "order_view", "pocket_manage"],
    })
    kid = r.json()["id"]
    client.post(f"/api/keys/{kid}/activate")
    return kid


def test_health_and_settings_defaults():
    assert client.get("/api/health").json()["ok"] is True
    s = client.get("/api/settings").json()
    assert s["read_only"] is False and s["limit_order_krw"] == "1000000"


def test_secret_never_leaks_in_key_list(key_id):
    assert SECRET not in client.get("/api/keys").text


def test_dryrun_authenticated_signs_but_does_not_send(key_id):
    d = client.post("/api/proxy", json={
        "key_id": key_id, "method": "GET", "path": "/v1/accounts",
        "params": {}, "authenticated": True, "dry_run": True, "endpoint_id": "accounts.list",
    }).json()
    assert d["dry_run"] is True and d["response"] is None
    assert d["request"]["headers"]["Authorization"].startswith("Bearer ")


def test_dryrun_secret_not_in_response(key_id):
    txt = client.post("/api/proxy", json={
        "key_id": key_id, "method": "GET", "path": "/v1/accounts", "params": {},
        "authenticated": True, "dry_run": True,
    }).text
    assert SECRET not in txt


def test_read_only_blocks_write(key_id):
    client.put("/api/settings", json={"read_only": True})
    try:
        b = client.post("/api/proxy", json={
            "key_id": key_id, "method": "POST", "path": "/v1/orders",
            "params": {"market": "KRW-BTC", "side": "bid", "ord_type": "price", "price": "5000"},
            "authenticated": True, "write": True, "endpoint_id": "orders.create",
        }).json()
        assert b["blocked"] is True and "읽기 전용" in b["reason"]
    finally:
        client.put("/api/settings", json={"read_only": False})


def test_amount_guard_blocks_oversize(key_id):
    client.put("/api/settings", json={"limit_order_krw": "1000"})
    try:
        b = client.post("/api/proxy", json={
            "key_id": key_id, "method": "POST", "path": "/v1/orders",
            "params": {"market": "KRW-BTC", "side": "bid", "ord_type": "price", "price": "5000"},
            "authenticated": True, "write": True, "endpoint_id": "orders.create",
            "guard": {"cap_key": "limit_order_krw", "amount": "5000", "label": "주문 KRW"},
        }).json()
        assert b["blocked"] is True
    finally:
        client.put("/api/settings", json={"limit_order_krw": "1000000"})


def test_guard_allows_within_cap_as_dryrun(key_id):
    # under the cap -> not blocked; dry-run so nothing is sent
    d = client.post("/api/proxy", json={
        "key_id": key_id, "method": "POST", "path": "/v1/orders",
        "params": {"market": "KRW-BTC", "side": "bid", "ord_type": "price", "price": "500"},
        "authenticated": True, "write": True, "dry_run": True, "endpoint_id": "orders.create",
        "guard": {"cap_key": "limit_order_krw", "amount": "500", "label": "주문 KRW"},
    }).json()
    assert d.get("blocked") in (False, None) and d["dry_run"] is True


def test_identifier_format():
    ident = client.get("/api/identifier").json()["identifier"]
    import re
    assert re.fullmatch(r"[A-Za-z0-9_.\-]{1,64}", ident)


def test_presets_crud():
    p = client.post("/api/presets", json={
        "name": "p1", "endpoint_id": "quotation.ticker", "method": "GET",
        "path": "/v1/ticker", "params": {"markets": "KRW-BTC"},
    }).json()
    assert any(x["name"] == "p1" for x in client.get("/api/presets").json())
    client.delete(f"/api/presets/{p['id']}")
    assert not any(x["id"] == p["id"] for x in client.get("/api/presets").json())


def test_logs_and_verify_persistence(key_id):
    # generate a log via dry-run
    client.post("/api/proxy", json={
        "key_id": key_id, "method": "GET", "path": "/v1/accounts", "params": {},
        "authenticated": True, "dry_run": True, "endpoint_id": "accounts.list", "label": "acc",
    })
    logs = client.get("/api/logs").json()
    assert len(logs) >= 1
    lid = logs[0]["id"]
    v = client.post(f"/api/logs/{lid}/verify", json={"checklist": {"done": True}, "note": "ok"}).json()
    assert v["verify_state"]["checklist"]["done"] is True
    assert client.get(f"/api/logs/{lid}").json()["verify_state"]["note"] == "ok"
