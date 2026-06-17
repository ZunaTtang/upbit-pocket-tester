import Combobox from "./Combobox";
import { POPULAR_MARKETS, POPULAR_CURRENCIES, netTypeHintFor } from "../catalogs";
import { genIdentifier, pocketOptions } from "../fieldutil";

// ===========================================================================
// FieldInput — single source of truth for rendering one endpoint field.
//
// Renders exactly one field. The parent owns any grid / col-span wrapper; this
// component returns a single <div> (or <label> for bool) per field.
//
// props:
//   field     the field descriptor from endpoints.js
//   value     current value for this field (from params[field.name])
//   onChange  (nextValue) => void  — sets this field's value
//   ctx       shared context:
//     pockets, loadPockets         pocket list + refresher
//     dynOpts, loadDynamic         dynamic-select option cache + loader
//     activeKey                    active API key (may be null)
//     params, setField             full params + setter (for cross-field writes)
//     marketCatalog                { markets, currencies } live catalog
//     loadMarketCatalog            catalog loader (lazy)
//     endpoint                     the endpoint descriptor (for maxRangeDays etc.)
// ===========================================================================
export default function FieldInput({ field: fld, value: v, onChange, ctx }) {
  const {
    pockets,
    loadPockets,
    dynOpts,
    loadDynamic,
    params,
    setField,
    marketCatalog,
    loadMarketCatalog,
    endpoint,
  } = ctx || {};

  // ---- bool: returns its own label-wrapped row ----------------------------
  if (fld.type === "bool")
    return (
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
        <span>{fld.label}</span>
      </label>
    );

  const label = (
    <label className="field-label">
      {fld.label}
      {fld.required && <span className="text-danger-600"> *</span>}
    </label>
  );

  // ---- select -------------------------------------------------------------
  if (fld.type === "select")
    return (
      <div>
        {label}
        <select className="field-input" value={v} onChange={(e) => onChange(e.target.value)}>
          {fld.options.map((o) => (
            <option key={o} value={o}>
              {o === "" ? "(미지정)" : o}
            </option>
          ))}
        </select>
        {fld.help && <p className="field-help">{fld.help}</p>}
      </div>
    );

  // ---- pocket (single) ----------------------------------------------------
  if (fld.type === "pocket") {
    const opts = pocketOptions(pockets);
    return (
      <div>
        {label}
        <div className="flex gap-1">
          <select className="field-input" value={v} onChange={(e) => onChange(e.target.value)}>
            <option value="">(미지정)</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadPockets(true)}
            className="btn btn-ghost btn-sm"
            title="포켓 목록 새로고침"
          >
            ↻
          </button>
        </div>
        {!opts.length && (
          <p className="field-help text-warn-600">
            포켓 목록이 비어있습니다. (a) 포켓 조회를 먼저 실행하거나 ↻ 로 불러오세요.
          </p>
        )}
      </div>
    );
  }

  // ---- pocket-array (multi checkbox) --------------------------------------
  if (fld.type === "pocket-array") {
    const opts = pocketOptions(pockets);
    const arr = Array.isArray(v) ? v : [];
    return (
      <div>
        {label}
        <div className="border border-ink-300 rounded-control p-1 max-h-28 overflow-auto bg-white">
          {opts.length === 0 && (
            <p className="field-help text-warn-600">포켓 목록 비어있음 (↻ 로 불러오기)</p>
          )}
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={arr.includes(o.value)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))
                }
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => loadPockets(true)} className="btn btn-ghost btn-sm mt-0.5">
          ↻ 포켓 새로고침
        </button>
      </div>
    );
  }

  // ---- dynamic-select -----------------------------------------------------
  if (fld.type === "dynamic-select") {
    const opts = (dynOpts && dynOpts[fld.name]) || [];
    return (
      <div>
        {label}
        <div className="flex gap-1">
          <select
            className="field-input"
            value={v}
            onChange={(e) => {
              onChange(e.target.value);
              const o = opts.find((x) => x.value === e.target.value);
              if (o && o.secondary && params && "secondary_address" in params && setField)
                setField("secondary_address", o.secondary);
            }}
          >
            <option value="">{opts.length ? "(주소 선택)" : "(먼저 불러오기)"}</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadDynamic(fld)}
            className="btn btn-ghost btn-sm whitespace-nowrap"
          >
            불러오기
          </button>
        </div>
      </div>
    );
  }

  // ---- market (single Combobox) -------------------------------------------
  if (fld.type === "market") {
    const opts =
      marketCatalog && marketCatalog.markets && marketCatalog.markets.length
        ? marketCatalog.markets
        : POPULAR_MARKETS;
    return (
      <div onFocus={loadMarketCatalog ? () => loadMarketCatalog() : undefined}>
        {label}
        <Combobox
          value={v || ""}
          onChange={(x) => onChange(x)}
          options={opts}
          allowFreeInput
          placeholder={fld.placeholder || "마켓 검색 (예: KRW-BTC, 비트코인)"}
          freeInputHint="목록에 없으면 직접 입력 후 Enter"
        />
        {fld.help && <p className="field-help">{fld.help}</p>}
      </div>
    );
  }

  // ---- markets (multi Combobox) -------------------------------------------
  if (fld.type === "markets") {
    const opts =
      marketCatalog && marketCatalog.markets && marketCatalog.markets.length
        ? marketCatalog.markets
        : POPULAR_MARKETS;
    // 내부 표현은 string[]. 배열이 아니고 문자열이면 콤마/공백으로 split (폴백).
    const arr = Array.isArray(v)
      ? v
      : typeof v === "string" && v.trim()
      ? v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
      : [];
    return (
      <div onFocus={loadMarketCatalog ? () => loadMarketCatalog() : undefined}>
        {label}
        <Combobox
          value={arr}
          onChange={(next) => onChange(next)}
          options={opts}
          multiple
          allowFreeInput
          placeholder={fld.placeholder || "마켓 검색 후 선택 (여러 개)"}
          freeInputHint="목록에 없으면 직접 입력 후 Enter"
        />
        {arr.length > 0 && (
          <p className="field-help">
            선택 {arr.length}개: {arr.join(", ")}
          </p>
        )}
        {fld.help && <p className="field-help">{fld.help}</p>}
      </div>
    );
  }

  // ---- currency (single Combobox) -----------------------------------------
  if (fld.type === "currency") {
    const opts =
      marketCatalog && marketCatalog.currencies && marketCatalog.currencies.length
        ? marketCatalog.currencies
        : POPULAR_CURRENCIES;
    const hints = v ? netTypeHintFor(v) : [];
    const showNetHint = hints.length > 0 && params && "net_type" in params;
    return (
      <div onFocus={loadMarketCatalog ? () => loadMarketCatalog() : undefined}>
        {label}
        <Combobox
          value={v || ""}
          onChange={(x) => onChange(x)}
          options={opts}
          allowFreeInput
          placeholder={fld.placeholder || "통화 검색 (예: BTC, 비트코인)"}
          freeInputHint="목록에 없으면 직접 입력 후 Enter"
        />
        {showNetHint && (
          <p className="field-help text-warn-600">net_type 후보: {hints.join(", ")}</p>
        )}
        {fld.help && <p className="field-help">{fld.help}</p>}
      </div>
    );
  }

  // ---- array (comma string) -----------------------------------------------
  if (fld.type === "array") {
    const arr = Array.isArray(v) ? v : [];
    return (
      <div>
        {label}
        <input
          className="field-input"
          value={arr.join(", ")}
          placeholder={fld.placeholder || "콤마로 구분"}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(/[,\s]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        />
      </div>
    );
  }

  // ---- identifier ---------------------------------------------------------
  if (fld.type === "identifier") {
    return (
      <div>
        {label}
        <div className="flex gap-1">
          <input
            className="field-input field-mono"
            value={v}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => onChange(genIdentifier())}
            className="btn btn-ghost btn-sm whitespace-nowrap"
          >
            재생성
          </button>
        </div>
        <p className="field-help">1회용. 재사용 불가. 로그에 보관됩니다.</p>
      </div>
    );
  }

  // ---- datetime -----------------------------------------------------------
  if (fld.type === "datetime") {
    const maxDays = endpoint && endpoint.maxRangeDays ? endpoint.maxRangeDays : null;

    // 로컬 datetime-local 문자열(YYYY-MM-DDTHH:mm)로 변환 (UTC ISO 보조 입력의 표시값).
    function toLocalInputValue(raw) {
      if (!raw) return "";
      const t = Date.parse(raw);
      if (Number.isNaN(t)) return "";
      const d = new Date(t);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    }

    // 빠른 칩: start_time 은 now - 기간, end_time 은 now. 그 외 필드는 now.
    function quickRange(ms) {
      const now = Date.now();
      const isStart = fld.name === "start_time";
      const target = isStart && ms ? now - ms : now;
      onChange(new Date(target).toISOString());
    }

    return (
      <div>
        {label}
        {maxDays && <p className="field-help">최대 {maxDays}일 범위까지 조회 가능</p>}
        <div className="flex flex-wrap gap-1">
          <input
            className="field-input field-mono"
            value={v}
            placeholder={fld.placeholder || "2026-06-16T00:00:00Z 또는 1718000000000"}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => onChange(new Date().toISOString())}
            className="btn btn-ghost btn-sm"
          >
            지금
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          <input
            type="datetime-local"
            className="field-input"
            value={toLocalInputValue(v)}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const t = Date.parse(val); // 로컬 시간으로 파싱됨
              if (!Number.isNaN(t)) onChange(new Date(t).toISOString());
            }}
          />
          <button type="button" onClick={() => quickRange(24 * 3600 * 1000)} className="btn btn-ghost btn-sm">
            최근 24시간
          </button>
          <button type="button" onClick={() => quickRange(7 * 24 * 3600 * 1000)} className="btn btn-ghost btn-sm">
            최근 7일
          </button>
          <button type="button" onClick={() => quickRange(0)} className="btn btn-ghost btn-sm">
            지금
          </button>
        </div>
      </div>
    );
  }

  // ---- text / number / decimal (default) ----------------------------------
  return (
    <div>
      {label}
      <input
        className={"field-input" + (fld.type === "decimal" ? " field-mono" : "")}
        inputMode={fld.type === "number" ? "numeric" : undefined}
        value={v}
        placeholder={fld.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {fld.help && <p className="field-help">{fld.help}</p>}
    </div>
  );
}
