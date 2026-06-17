import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

// 주문하기 보조 위젯: 선택한 마켓의 현재가 + 보유량/주문가능/수수료/최소주문을 보여주고,
// 현재가·비율로 price/volume 을 빠르게 채운다. (현재가는 비인증, 보유량은 활성 키 필요)

function fmt(v, max = 8) {
  if (v == null || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("ko-KR", { maximumFractionDigits: max });
}
function pct(rate) {
  const n = Number(rate);
  if (Number.isNaN(n)) return "-";
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
}
function trimDec(n, d = 8) {
  if (!isFinite(n) || n <= 0) return "";
  return String(Number(n.toFixed(d)));
}

function Info({ label, value, tone }) {
  const c = tone === "pos" ? "text-ok-600" : tone === "neg" ? "text-danger-600" : "text-ink-900";
  return (
    <div className="flex justify-between gap-2 border-b border-brand-200/50 py-0.5">
      <span className="text-ink-500">{label}</span>
      <span className={`font-mono font-semibold ${c}`}>{value}</span>
    </div>
  );
}

export default function OrderMarketInfo({ params, setField }) {
  const { activeKey, notify } = useStore();
  const market = params.market;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!market || !market.includes("-")) {
      setData(null);
      return;
    }
    setLoading(true);
    const next = { quote: market.split("-")[0], base: market.split("-")[1] };
    try {
      const t = await api.proxy({
        key_id: null, method: "GET", path: "/v1/ticker", params: { markets: market },
        authenticated: false, endpoint_id: "quotation.ticker", label: "주문 도우미 · 현재가",
      });
      const tb = t.response && t.response.body;
      const tk = Array.isArray(tb) ? tb[0] : null;
      if (tk) {
        next.price = tk.trade_price;
        next.change = tk.signed_change_rate;
        next.high = tk.high_price;
        next.low = tk.low_price;
      }
    } catch {
      /* 현재가 실패는 조용히 — JSON 은 히스토리에서 확인 가능 */
    }
    if (activeKey) {
      try {
        const c = await api.proxy({
          key_id: activeKey.id, method: "GET", path: "/v1/orders/chance", params: { market },
          authenticated: true, endpoint_id: "accounts.chance", label: "주문 도우미 · 주문가능",
        });
        const cb = c.response && c.response.body;
        if (cb && !cb.error) {
          next.bidBal = cb.bid_account && cb.bid_account.balance;
          next.askBal = cb.ask_account && cb.ask_account.balance;
          next.bidFee = cb.bid_fee;
          next.askFee = cb.ask_fee;
          next.minBid = cb.market && cb.market.bid && cb.market.bid.min_total;
          next.minAsk = cb.market && cb.market.ask && cb.market.ask.min_total;
        }
      } catch {
        /* 잔고 실패(권한/네트워크)는 조용히 — 현재가만 표시 */
      }
    }
    setData(next);
    setLoading(false);
  }

  // 마켓/활성키가 바뀌면 자동 갱신 (마켓 선택은 콤보박스라 빈번하지 않음).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, activeKey && activeKey.id]);

  if (!market) {
    return (
      <div className="callout-info mb-3 text-xs">
        마켓을 선택하면 <b>현재가·보유량</b>이 여기에 표시됩니다.
      </div>
    );
  }

  const d = data || {};
  const up = Number(d.change) >= 0;

  function fillRatio(p) {
    const price = Number(params.price) || Number(d.price);
    if (params.side === "ask") {
      const bal = Number(d.askBal) || 0;
      const v = trimDec(bal * p, 8);
      if (!v) return notify("매도가능 수량이 없습니다(보유량/권한 확인).", "info");
      setField("volume", v);
    } else {
      const krw = Number(d.bidBal) || 0;
      if (!krw) return notify("매수가능 KRW 가 없습니다(보유량/권한 확인).", "info");
      if (params.ord_type === "price") {
        setField("price", String(Math.floor(krw * p)));
      } else {
        if (!price) return notify("가격을 먼저 입력하거나 '현재가→가격'을 누르세요.", "info");
        const v = trimDec((krw * p) / price, 8);
        if (v) setField("volume", v);
      }
    }
  }

  return (
    <div className="callout-info mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-brand-800">📊 {market} · 시세 / 보유</span>
        <button type="button" onClick={load} className="btn-ghost btn-sm">
          {loading ? "조회 중…" : "↻ 새로고침"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
        <Info label="현재가" value={fmt(d.price)} tone={up ? "pos" : "neg"} />
        <Info label="전일대비" value={pct(d.change)} tone={up ? "pos" : "neg"} />
        <Info label="수수료(매수/매도)" value={d.bidFee != null ? `${pct(d.bidFee)} / ${pct(d.askFee)}` : "-"} />
        <Info label={`매수가능 (${d.quote || "KRW"})`} value={fmt(d.bidBal)} />
        <Info label={`매도가능 (${d.base || ""})`} value={fmt(d.askBal)} />
        <Info label="최소주문(매수/매도)" value={d.minBid != null ? `${fmt(d.minBid)} / ${fmt(d.minAsk)}` : "-"} />
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-2">
        <span className="text-[11px] text-ink-500 mr-1">빠른 채움:</span>
        <button type="button" onClick={() => d.price != null && setField("price", String(d.price))} className="btn-ghost btn-sm">
          현재가→가격
        </button>
        {[0.25, 0.5, 1].map((p) => (
          <button key={p} type="button" onClick={() => fillRatio(p)} className="btn-ghost btn-sm">
            {p === 1 ? "전액" : `${p * 100}%`}
          </button>
        ))}
        <span className="text-[11px] text-ink-400 ml-1">
          (side/ord_type 기준: 매도=수량, 시장가매수=KRW총액, 지정가매수=가격기준 수량)
        </span>
      </div>
      {!activeKey && <p className="field-help mt-1">보유량/수수료는 활성 키가 있어야 표시됩니다(현재가는 키 없이 표시).</p>}
    </div>
  );
}
