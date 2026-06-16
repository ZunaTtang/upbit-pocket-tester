import { useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { ENDPOINT_BY_ID, PERMISSION_LABEL, resolvePath } from "../endpoints";
import ReqRespViewer from "./ReqRespViewer";
import ConfirmModal from "./ConfirmModal";
import VerifyChecklist from "./VerifyChecklist";
import { CopyButton } from "./JsonView";

// ---- small helpers --------------------------------------------------------
function genIdentifier() {
  let rand = "";
  if (window.crypto && window.crypto.getRandomValues) {
    const b = new Uint8Array(8);
    window.crypto.getRandomValues(b);
    rand = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } else {
    rand = Math.random().toString(16).slice(2, 18);
  }
  return `wb-${rand}`;
}

function parseTimeMs(v) {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function defaultParams(ep, initial) {
  const p = {};
  for (const fld of ep.fields) {
    if (fld.type === "array" || fld.type === "pocket-array") p[fld.name] = [];
    else if (fld.type === "bool") p[fld.name] = fld.default ?? false;
    else p[fld.name] = fld.default ?? "";
    if (fld.type === "identifier" && fld.autogen && !p[fld.name]) p[fld.name] = genIdentifier();
  }
  if (initial) for (const k of Object.keys(initial)) p[k] = initial[k];
  return p;
}

function pocketOptions(pockets) {
  return (pockets || []).map((pk) => ({
    value: pk.uuid,
    label: `${pk.name ?? "(이름없음)"} · ${pk.pocket_type ?? "?"} · ${String(pk.uuid || "").slice(0, 8)}…`,
  }));
}

// ===========================================================================
export default function EndpointRunner({ endpoint: ep, initialParams, nested = false }) {
  const { activeKey, settings, pockets, loadPockets, notify, presets, savePreset, deletePreset } = useStore();
  const [params, setParams] = useState(() => defaultParams(ep, initialParams));
  const [presetSel, setPresetSel] = useState("");
  const [open, setOpen] = useState(nested);
  const [localDry, setLocalDry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [sent, setSent] = useState(null); // {params, respBody, logId}
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [dynOpts, setDynOpts] = useState({});

  const isWrite = ep.write || ep.method !== "GET";

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
    if (err) return notify(err, "error");
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
      setResult(res);
      setSent({
        params: { ...params },
        respBody: res.response ? res.response.body : null,
        logId: res.log_id,
      });
      if (res.blocked) notify(res.reason, "error");
      else if (ep.refreshesPockets) await loadPockets(true);
    } catch (e) {
      notify("호출 실패: " + e.message, "error");
      setResult({ error: e.message });
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

  // ---- field renderer -----------------------------------------------------
  function renderField(fld) {
    const v = params[fld.name];
    const common = "w-full border border-slate-300 rounded px-2 py-1 text-sm";
    if (fld.type === "bool")
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v} onChange={(e) => setField(fld.name, e.target.checked)} />
          <span>{fld.label}</span>
        </label>
      );

    const label = (
      <label className="block text-xs font-semibold text-slate-600 mb-0.5">
        {fld.label}
        {fld.required && <span className="text-rose-500"> *</span>}
      </label>
    );

    if (fld.type === "select")
      return (
        <div>
          {label}
          <select className={common} value={v} onChange={(e) => setField(fld.name, e.target.value)}>
            {fld.options.map((o) => (
              <option key={o} value={o}>{o === "" ? "(미지정)" : o}</option>
            ))}
          </select>
          {fld.help && <p className="text-[11px] text-slate-400 mt-0.5">{fld.help}</p>}
        </div>
      );

    if (fld.type === "pocket") {
      const opts = pocketOptions(pockets);
      return (
        <div>
          {label}
          <div className="flex gap-1">
            <select className={common} value={v} onChange={(e) => setField(fld.name, e.target.value)}>
              <option value="">(미지정)</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => loadPockets(true)} className="text-xs px-2 border border-slate-300 rounded bg-white" title="포켓 목록 새로고침">↻</button>
          </div>
          {!opts.length && <p className="text-[11px] text-amber-600 mt-0.5">포켓 목록이 비어있습니다. (a) 포켓 조회를 먼저 실행하거나 ↻ 로 불러오세요.</p>}
        </div>
      );
    }

    if (fld.type === "pocket-array") {
      const opts = pocketOptions(pockets);
      const arr = Array.isArray(v) ? v : [];
      return (
        <div>
          {label}
          <div className="border border-slate-300 rounded p-1 max-h-28 overflow-auto bg-white">
            {opts.length === 0 && <p className="text-[11px] text-amber-600">포켓 목록 비어있음 (↻ 로 불러오기)</p>}
            {opts.map((o) => (
              <label key={o.value} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={arr.includes(o.value)}
                  onChange={(e) =>
                    setField(fld.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))
                  }
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => loadPockets(true)} className="text-[11px] mt-0.5 text-sky-600">↻ 포켓 새로고침</button>
        </div>
      );
    }

    if (fld.type === "dynamic-select") {
      const opts = dynOpts[fld.name] || [];
      return (
        <div>
          {label}
          <div className="flex gap-1">
            <select
              className={common}
              value={v}
              onChange={(e) => {
                setField(fld.name, e.target.value);
                const o = opts.find((x) => x.value === e.target.value);
                if (o && o.secondary && "secondary_address" in params) setField("secondary_address", o.secondary);
              }}
            >
              <option value="">{opts.length ? "(주소 선택)" : "(먼저 불러오기)"}</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => loadDynamic(fld)} className="text-xs px-2 border border-slate-300 rounded bg-white whitespace-nowrap">불러오기</button>
          </div>
        </div>
      );
    }

    if (fld.type === "array") {
      const arr = Array.isArray(v) ? v : [];
      return (
        <div>
          {label}
          <input
            className={common}
            value={arr.join(", ")}
            placeholder={fld.placeholder || "콤마로 구분"}
            onChange={(e) =>
              setField(
                fld.name,
                e.target.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
              )
            }
          />
        </div>
      );
    }

    if (fld.type === "identifier") {
      return (
        <div>
          {label}
          <div className="flex gap-1">
            <input className={common + " font-mono"} value={v} onChange={(e) => setField(fld.name, e.target.value)} />
            <button type="button" onClick={() => setField(fld.name, genIdentifier())} className="text-xs px-2 border border-slate-300 rounded bg-white whitespace-nowrap">재생성</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">1회용. 재사용 불가. 로그에 보관됩니다.</p>
        </div>
      );
    }

    if (fld.type === "datetime") {
      return (
        <div>
          {label}
          <div className="flex gap-1">
            <input className={common + " font-mono"} value={v} placeholder={fld.placeholder || "2026-06-16T00:00:00Z 또는 1718000000000"} onChange={(e) => setField(fld.name, e.target.value)} />
            <button type="button" onClick={() => setField(fld.name, new Date().toISOString())} className="text-xs px-2 border border-slate-300 rounded bg-white">지금</button>
          </div>
        </div>
      );
    }

    // text / number / decimal
    return (
      <div>
        {label}
        <input
          className={common + (fld.type === "decimal" ? " font-mono" : "")}
          inputMode={fld.type === "number" ? "numeric" : undefined}
          value={v}
          placeholder={fld.placeholder || ""}
          onChange={(e) => setField(fld.name, e.target.value)}
        />
        {fld.help && <p className="text-[11px] text-slate-400 mt-0.5">{fld.help}</p>}
      </div>
    );
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

  // ---- render -------------------------------------------------------------
  const card = (
    <div className={nested ? "" : "bg-white border border-slate-200 rounded-lg shadow-sm"}>
      {!nested && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isWrite ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
          }`}>{ep.method}</span>
          <span className="font-semibold text-sm text-slate-800">{ep.label}</span>
          {isWrite && <span className="text-[10px] text-rose-500">쓰기</span>}
          <span className="ml-auto text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
        </button>
      )}

      {(open || nested) && (
        <div className={nested ? "" : "px-3 pb-3"}>
          {!nested && (
            <div className="text-xs text-slate-500 mb-2 font-mono break-all">
              {ep.method} {resolvePath(ep, params)}
              {ep.desc && <div className="mt-1 not-italic text-slate-500 font-sans">{ep.desc}</div>}
            </div>
          )}

          {!nested && (
            <div className="flex items-center gap-1 mb-2 text-xs">
              <span className="text-slate-500">프리셋</span>
              <select
                value={presetSel}
                onChange={(e) => applyPreset(e.target.value)}
                className="border border-slate-300 rounded px-1 py-0.5"
              >
                <option value="">불러오기…</option>
                {myPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="button" onClick={doSavePreset} className="px-2 py-0.5 border border-slate-300 rounded bg-white">현재값 저장</button>
              {presetSel && (
                <button type="button" onClick={removePreset} className="px-2 py-0.5 border border-rose-300 text-rose-600 rounded bg-white">삭제</button>
              )}
            </div>
          )}

          {!gate.ok && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
              호출 불가: {gate.reason}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-2">
            {ep.fields.map((fld) => (
              <div key={fld.name} className={fld.type === "pocket-array" || fld.type === "array" ? "sm:col-span-2" : ""}>
                {renderField(fld)}
              </div>
            ))}
            {ep.fields.length === 0 && <p className="text-xs text-slate-400">파라미터 없음.</p>}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={run}
              disabled={!gate.ok || busy}
              className={`px-4 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-40 ${
                isWrite ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"
              }`}
            >
              {busy ? "호출 중…" : isWrite ? "실행(확인 후 전송)" : "호출"}
            </button>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={localDry} onChange={(e) => setLocalDry(e.target.checked)} />
              이번 호출만 Dry-run
            </label>
          </div>

          {depositAddr && (
            <div className="mt-3 border border-sky-200 bg-sky-50 rounded p-2">
              <div className="text-xs font-semibold text-sky-800 mb-1">입금 주소 (이 주소로 외부에서 직접 소액을 보내세요 — 수동)</div>
              <div className="flex items-center gap-2">
                <code className="text-xs break-all bg-white px-2 py-1 rounded border border-sky-200 flex-1">{depositAddr}</code>
                <CopyButton value={depositAddr} label="주소 복사" />
              </div>
              {result.response.body.secondary_address && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-500">2차주소/태그:</span>
                  <code className="text-xs break-all bg-white px-2 py-1 rounded border border-sky-200 flex-1">{result.response.body.secondary_address}</code>
                  <CopyButton value={result.response.body.secondary_address} label="복사" />
                </div>
              )}
            </div>
          )}

          <ReqRespViewer result={result} />

          {showVerify && pairEp && (
            <div className="mt-3 border-2 border-emerald-300 rounded-lg p-3 bg-emerald-50/40">
              <div className="text-sm font-bold text-emerald-800 mb-1">🔁 {ep.verify.title}</div>
              <p className="text-xs text-slate-500 mb-2">
                방금 보낸 값으로 <b>{pairEp.label}</b> 조회를 미리 채웠습니다. 실행 후 아래 체크리스트로 대조하세요.
              </p>
              <div className="bg-white border border-emerald-200 rounded p-2">
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
