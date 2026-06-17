import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { ENDPOINT_BY_ID, PERMISSION_LABEL, resolvePath, METHOD_BADGE } from "../endpoints";
import { genIdentifier, parseTimeMs } from "../fieldutil";
import FieldInput from "./FieldInput";
import ReqRespViewer from "./ReqRespViewer";
import ConfirmModal from "./ConfirmModal";
import VerifyChecklist from "./VerifyChecklist";
import { CopyButton } from "./JsonView";

// write actions that demand the high-risk acknowledgement gate in ConfirmModal.
const HIGH_RISK_IDS = new Set(["withdraws.coin", "withdraws.krw", "orders.cancel_bulk"]);

// 탭 전환 helper — App 이 wb:navtab 을 듣고 setTab 한다.
function navTab(tabId) {
  window.dispatchEvent(new CustomEvent("wb:navtab", { detail: tabId }));
}

// ---- defaults -------------------------------------------------------------
function defaultParams(ep, initial) {
  const p = {};
  for (const fld of ep.fields) {
    if (fld.type === "markets") p[fld.name] = [];
    else if (fld.type === "array" || fld.type === "pocket-array") p[fld.name] = [];
    else if (fld.type === "bool") p[fld.name] = fld.default ?? false;
    else p[fld.name] = fld.default ?? "";
    if (fld.type === "identifier" && fld.autogen && !p[fld.name]) p[fld.name] = genIdentifier();
  }
  if (initial) for (const k of Object.keys(initial)) p[k] = initial[k];
  return p;
}

// ===========================================================================
export default function EndpointRunner({ endpoint: ep, initialParams, nested = false }) {
  const {
    activeKey,
    settings,
    pockets,
    loadPockets,
    notify,
    presets,
    savePreset,
    deletePreset,
    marketCatalog,
    loadMarketCatalog,
  } = useStore();
  const [params, setParams] = useState(() => defaultParams(ep, initialParams));
  const [presetSel, setPresetSel] = useState("");
  const [open, setOpen] = useState(nested);
  const [localDry, setLocalDry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [sent, setSent] = useState(null); // {params, respBody, logId}
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [dynOpts, setDynOpts] = useState({});
  const [fieldErr, setFieldErr] = useState(null);

  const isWrite = ep.write || ep.method !== "GET";

  // 마운트 시 마켓/통화 카탈로그 1회 로드.
  useEffect(() => {
    loadMarketCatalog();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- gating -------------------------------------------------------------
  const gate = useMemo(() => {
    if (ep.auth && !activeKey) return { ok: false, reason: "활성 API 키가 없습니다." };
    if (ep.pocketType && activeKey && activeKey.pocket_type !== ep.pocketType)
      return { ok: false, reason: `${ep.pocketType === "main" ? "메인" : "서브"}포켓 키 전용입니다.` };
    if (ep.permission && activeKey && !activeKey.permissions.includes(ep.permission))
      return { ok: false, reason: `이 키에 '${PERMISSION_LABEL[ep.permission]}' 권한(메타)이 없습니다.` };
    if (settings.read_only && isWrite) return { ok: false, reason: "읽기 전용 모드가 켜져 있습니다." };
    return { ok: true };
  }, [ep, activeKey, settings.read_only, isWrite]);

  function setField(name, value) {
    setParams((p) => ({ ...p, [name]: value }));
  }

  // ---- payload ------------------------------------------------------------
  function buildQueryParams() {
    const out = {};
    for (const fld of ep.fields) {
      if (fld.pathOnly) continue;
      const v = params[fld.name];
      if (fld.type === "bool") {
        if (v === true) out[fld.name] = "true";
      } else if (fld.type === "markets") {
        // 내부 string[] (문자열 폴백 파싱) → 비어있지 않으면 콤마 문자열로 직렬화.
        const arr = Array.isArray(v)
          ? v
          : typeof v === "string" && v.trim()
          ? v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
          : [];
        if (arr.length) out[fld.name] = arr.join(",");
      } else if (fld.type === "array" || fld.type === "pocket-array") {
        if (Array.isArray(v) && v.length) out[fld.name] = v;
      } else if (v !== "" && v != null) {
        out[fld.name] = v;
      }
    }
    return out;
  }

  function buildPayload() {
    const guard = ep.guard ? ep.guard(params) : null;
    return {
      key_id: ep.auth ? (activeKey ? activeKey.id : null) : null,
      method: ep.method,
      path: resolvePath(ep, params),
      params: buildQueryParams(),
      authenticated: !!ep.auth,
      write: !!isWrite,
      dry_run: localDry,
      endpoint_id: ep.id,
      label: ep.label,
      guard,
    };
  }

  function validate() {
    for (const fld of ep.fields) {
      if (!fld.required) continue;
      const v = params[fld.name];
      const empty = v === "" || v == null || (Array.isArray(v) && v.length === 0);
      if (empty) return `필수값 누락: ${fld.label}`;
    }
    if (ep.requireFromToDiffer && params.from && params.to && params.from === params.to)
      return "from 과 to 가 같습니다. 서로 다른 포켓이어야 합니다.";
    for (const fld of ep.fields) {
      if (fld.type === "identifier" && params[fld.name]) {
        if (!/^[A-Za-z0-9_.-]{1,64}$/.test(params[fld.name]))
          return "identifier 형식 오류: 1~64자, 영문/숫자/_/./- 만 허용.";
      }
    }
    if (ep.maxRangeDays && params.start_time && params.end_time) {
      const a = parseTimeMs(params.start_time);
      const b = parseTimeMs(params.end_time);
      if (a == null || b == null) return "start_time/end_time 형식 오류 (ISO8601 또는 ms).";
      const days = (b - a) / 86400000;
      if (days < 0) return "end_time 이 start_time 보다 빠릅니다.";
      if (days > ep.maxRangeDays) return `조회 기간은 최대 ${ep.maxRangeDays}일입니다. (현재 ${days.toFixed(1)}일)`;
    }
    return null;
  }

  // ---- run ----------------------------------------------------------------
  async function run() {
    const err = validate();
    if (err) {
      setFieldErr(err);
      return;
    }
    setFieldErr(null);
    const payload = buildPayload();
    const willSend = isWrite && !settings.dry_run && !localDry;
    if (willSend) {
      setConfirmPayload(payload);
      return;
    }
    await send(payload);
  }

  async function send(payload) {
    setBusy(true);
    try {
      const res = await api.proxy(payload);
      setResult({ ...res, endpoint_id: ep.id });
      setSent({
        params: { ...params },
        respBody: res.response ? res.response.body : null,
        logId: res.log_id,
      });
      if (res.blocked) notify(res.reason, "error");
      else if (ep.refreshesPockets) await loadPockets(true);
    } catch (e) {
      notify("호출 실패: " + e.message, "error");
      setResult({ error: e.message, endpoint_id: ep.id });
    } finally {
      setBusy(false);
    }
  }

  async function loadDynamic(fld) {
    if (!activeKey) return notify("활성 키가 필요합니다.", "error");
    const ep2 = ENDPOINT_BY_ID[fld.dynamic.endpointId];
    try {
      const res = await api.proxy({
        key_id: activeKey.id,
        method: "GET",
        path: resolvePath(ep2, {}),
        params: {},
        authenticated: true,
        endpoint_id: ep2.id,
        label: ep2.label + " (옵션 로딩)",
      });
      const body = res.response ? res.response.body : null;
      const opts = fld.dynamic.map(body, params);
      setDynOpts((o) => ({ ...o, [fld.name]: opts }));
      if (!opts.length) notify("등록된 항목이 없습니다(또는 권한/통화 확인).", "info");
    } catch (e) {
      notify("옵션 로딩 실패: " + e.message, "error");
    }
  }

  const myPresets = presets.filter((p) => p.endpoint_id === ep.id);
  async function doSavePreset() {
    const name = window.prompt("프리셋 이름:");
    if (!name) return;
    try {
      await savePreset({ name, endpoint_id: ep.id, method: ep.method, path: resolvePath(ep, params), params, note: "" });
      notify("프리셋 저장됨", "success");
    } catch (e) {
      notify("저장 실패: " + e.message, "error");
    }
  }
  function applyPreset(id) {
    setPresetSel(id);
    const p = myPresets.find((x) => String(x.id) === String(id));
    if (p) setParams((pp) => ({ ...pp, ...p.params }));
  }
  async function removePreset() {
    if (!presetSel) return;
    try {
      await deletePreset(Number(presetSel));
      setPresetSel("");
      notify("프리셋 삭제됨", "success");
    } catch (e) {
      notify(e.message, "error");
    }
  }

  // ---- verify panel -------------------------------------------------------
  const showVerify =
    !nested && ep.verify && sent && result && !result.blocked && !result.dry_run &&
    result.response && result.response.status < 400;
  const pairEp = ep.verify ? ENDPOINT_BY_ID[ep.verify.pairEndpointId] : null;
  const depositAddr =
    ep.addressDisplay && result && result.response && result.response.body
      ? result.response.body.deposit_address
      : null;

  // 필드 렌더 컨텍스트 (FieldInput 공유).
  const fieldCtx = {
    pockets,
    loadPockets,
    dynOpts,
    loadDynamic,
    activeKey,
    params,
    setField,
    marketCatalog,
    loadMarketCatalog,
    endpoint: ep,
  };

  const highRisk = HIGH_RISK_IDS.has(ep.id);

  // gate.reason 에 따라 안내 액션을 가른다.
  const gateNeedsKey = !gate.ok && gate.reason && gate.reason.includes("활성 API 키");
  const gateReadOnly = !gate.ok && gate.reason && gate.reason.includes("읽기 전용");

  // ---- render -------------------------------------------------------------
  const card = (
    <div className={nested ? "" : `card${isWrite ? " card-write" : ""}`}>
      {!nested && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 text-left"
        >
          <span className={`badge ${METHOD_BADGE[ep.method] || "badge-get"}`}>{ep.method}</span>
          <span className="font-semibold text-[15px] text-ink-900">{ep.label}</span>
          {isWrite && <span className="badge bg-danger-100 text-danger-700">쓰기</span>}
          <span className="ml-auto text-ink-400 text-xs">{open ? "▾" : "▸"}</span>
        </button>
      )}

      {(open || nested) && (
        <div className={nested ? "" : "mt-3"}>
          {!nested && (
            <div className="mb-3">
              <div className="text-xs text-ink-500 font-mono break-words">
                {ep.method} {resolvePath(ep, params)}
              </div>
              {ep.desc && <div className="mt-1 text-sm text-ink-600">{ep.desc}</div>}
            </div>
          )}

          {!nested && ep.preset && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
              <span className="text-ink-500">프리셋</span>
              <select
                value={presetSel}
                onChange={(e) => applyPreset(e.target.value)}
                className="field-input"
                style={{ width: "auto" }}
              >
                <option value="">불러오기…</option>
                {myPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="button" onClick={doSavePreset} className="btn btn-ghost btn-sm">
                현재값 저장
              </button>
              {presetSel && (
                <button type="button" onClick={removePreset} className="btn btn-ghost btn-sm text-danger-600">
                  삭제
                </button>
              )}
            </div>
          )}

          {!gate.ok && (
            <div className="callout-warn mb-3">
              <span className="font-semibold">⚠ 호출 불가:</span> {gate.reason}
              {gateNeedsKey && (
                <button type="button" onClick={() => navTab("keys")} className="btn btn-ghost btn-sm ml-2">
                  키 관리 탭으로
                </button>
              )}
              {gateReadOnly && (
                <button type="button" onClick={() => navTab("settings")} className="btn btn-ghost btn-sm ml-2">
                  설정으로
                </button>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
            {ep.fields.map((fld) => (
              <div
                key={fld.name}
                className={
                  fld.type === "pocket-array" || fld.type === "array" || fld.type === "markets"
                    ? "sm:col-span-2"
                    : ""
                }
              >
                <FieldInput
                  field={fld}
                  value={params[fld.name]}
                  onChange={(val) => setField(fld.name, val)}
                  ctx={fieldCtx}
                />
              </div>
            ))}
            {ep.fields.length === 0 && (
              <p className="empty-state sm:col-span-2">파라미터 없음.</p>
            )}
          </div>

          {fieldErr && <div className="inline-error mt-3">{fieldErr}</div>}

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={run}
              disabled={!gate.ok || busy}
              className={isWrite ? "btn btn-danger" : "btn btn-primary"}
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  호출 중…
                </span>
              ) : localDry ? (
                "Dry-run 실행(전송 안함)"
              ) : isWrite ? (
                "실행(확인 후 전송)"
              ) : (
                "호출"
              )}
            </button>
            <label className="flex items-center gap-1 text-xs text-ink-600">
              <input type="checkbox" checked={localDry} onChange={(e) => setLocalDry(e.target.checked)} />
              이번 호출만 Dry-run
            </label>
            {!gate.ok && <span className="text-xs text-ink-500">{gate.reason}</span>}
          </div>

          {depositAddr && (
            <div className="mt-3 callout-info">
              <div className="text-xs font-semibold text-brand-700 mb-1">
                입금 주소 (이 주소로 외부에서 직접 소액을 보내세요 — 수동)
              </div>
              <div className="flex items-center gap-2">
                <code className="field-mono text-xs break-words bg-white px-2 py-1 rounded-control border border-brand-200 flex-1">
                  {depositAddr}
                </code>
                <CopyButton value={depositAddr} label="주소 복사" />
              </div>
              {result.response.body.secondary_address && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-ink-500">2차주소/태그:</span>
                  <code className="field-mono text-xs break-words bg-white px-2 py-1 rounded-control border border-brand-200 flex-1">
                    {result.response.body.secondary_address}
                  </code>
                  <CopyButton value={result.response.body.secondary_address} label="복사" />
                </div>
              )}
            </div>
          )}

          <ReqRespViewer result={result} />

          {showVerify && pairEp && (
            <div className="mt-3 rounded-card border-2 border-ok-600/40 bg-ok-50/50 p-4">
              <div className="text-sm font-bold text-ok-800 mb-1">🔁 {ep.verify.title}</div>
              <p className="text-xs text-ink-500 mb-2">
                방금 보낸 값으로 <b>{pairEp.label}</b> 조회를 미리 채웠습니다. 실행 후 아래 체크리스트로 대조하세요.
              </p>
              <div className="bg-white border border-ok-200 rounded-control p-2">
                <EndpointRunner
                  endpoint={pairEp}
                  initialParams={ep.verify.buildParams(sent.params, sent.respBody)}
                  nested
                />
              </div>
              <VerifyChecklist logId={sent.logId} items={ep.verify.checklist} />
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirmPayload}
        title={ep.label}
        method={confirmPayload && confirmPayload.method}
        url={confirmPayload && confirmPayload.path}
        body={confirmPayload && (confirmPayload.params || {})}
        highRisk={highRisk}
        guard={ep.guard ? ep.guard(params) : null}
        onCancel={() => setConfirmPayload(null)}
        onConfirm={() => {
          const p = confirmPayload;
          setConfirmPayload(null);
          send(p);
        }}
      />
    </div>
  );

  return card;
}
