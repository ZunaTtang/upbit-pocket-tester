// ===========================================================================
// summarize.js — Upbit Open API 응답을 사람이 읽는 요약(Summary)으로 변환.
//
// 단일 진입점 summarize(endpointId, body, status) 와 에러 사전 UPBIT_ERROR_DICT.
//
// 설계 원칙:
//   - 절대 throw 하지 않는다. 전체를 try/catch 로 감싸고 실패 시 null 반환.
//   - 모든 필드 접근은 옵셔널 체이닝. 없는 필드에서 만들어진 row 는 제거한다.
//   - 표현(색/배지/포맷)만 담당. UI 렌더는 호출 측 책임.
//
// Summary 형태:
//   { kind: "object"|"list"|"error", title, rows: Row[],
//     items?: Item[], note?: string, error?: {name, message, friendly} }
//   Row  = { label, value: string, mono?: bool, tone?: "pos"|"neg"|"muted" }
//   Item = { title, rows: Row[], badge?: {text, tone: "pos"|"neg"|"neutral"|"warn"} }
// ===========================================================================

// ---------------------------------------------------------------------------
// 에러 사전 — 업비트 error.name → 한국어 친화 설명.
// 모르는 name 은 friendly 를 비우고 원본 message 를 노출한다.
// ---------------------------------------------------------------------------
export const UPBIT_ERROR_DICT = {
  out_of_scope: "권한 없음 — 이 API 키의 권한 설정을 확인하세요.",
  invalid_query_payload:
    "파라미터 형식/조합이 잘못되었거나 query_hash 불일치 — 필수값·타입·전송 위치(쿼리/바디)를 확인하세요.",
  jwt_verification: "서명(JWT) 검증 실패 — 시크릿 키 또는 서명 방식을 확인하세요.",
  expired_access_key: "만료된 액세스 키 — 키를 재발급하거나 교체하세요.",
  nonce_used: "이미 사용된 nonce — 동일 요청을 재전송하지 마세요.",
  no_authorization_token: "인증 토큰 누락 — Authorization 헤더가 비어 있습니다.",
  invalid_access_key: "유효하지 않은 액세스 키 — 키 ID를 확인하세요.",
  insufficient_funds_bid: "매수 가능 KRW 부족 — 주문 총액을 줄이거나 KRW를 충전하세요.",
  insufficient_funds_ask: "매도 가능 수량 부족 — 보유 수량을 확인하세요.",
  under_min_total_bid: "최소 매수 주문 금액 미달 — 주문 총액을 키우세요.",
  under_min_total_ask: "최소 매도 주문 금액 미달 — 주문 총액을 키우세요.",
  withdraw_address_not_registered:
    "미등록 출금 주소 — 업비트 웹에서 출금 허용 주소로 먼저 등록하세요.",
  validation_error: "요청 검증 실패 — 입력값을 다시 확인하세요.",
  too_many_requests: "요청이 너무 많습니다(레이트 리밋) — 잠시 후 다시 시도하세요.",
};

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------
const DASH = "-";

function isEmptyVal(v) {
  return v == null || v === "" || v === DASH;
}

// 천 단위 콤마 + 불필요한 끝 0 제거. 불가하면 원문(문자열) 또는 대시.
function fmtNum(v) {
  if (v == null || v === "") return DASH;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return typeof v === "string" ? v : DASH;
  // 끝 0 / 불필요한 소수점 제거 후 정수부에 천단위 콤마.
  let s = String(n);
  if (s.includes("e") || s.includes("E")) {
    // 지수 표기는 toFixed 로 펴되 과도한 자리는 제거.
    s = n.toFixed(8);
  }
  let neg = "";
  if (s.startsWith("-")) {
    neg = "-";
    s = s.slice(1);
  }
  let [intPart, fracPart = ""] = s.split(".");
  fracPart = fracPart.replace(/0+$/, "");
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg + (fracPart ? `${intPart}.${fracPart}` : intPart);
}

// 비율(0.0123) → 부호 + 소수 1자리 + 퍼센트. (Number * 100)
function fmtPct(v) {
  if (v == null || v === "") return DASH;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return DASH;
  const pct = n * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ISO8601 문자열 또는 ms 타임스탬프 → ko-KR 로컬 시각. 실패 시 원문.
function fmtTime(v) {
  if (v == null || v === "") return DASH;
  let d;
  if (typeof v === "number") {
    d = new Date(v);
  } else if (/^\d+$/.test(String(v).trim())) {
    d = new Date(Number(v));
  } else {
    d = new Date(v);
  }
  if (!d || Number.isNaN(d.getTime())) return String(v);
  try {
    return d.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}

// obj 에서 keys 만 골라 새 객체로.
function pick(obj, keys) {
  const out = {};
  if (!obj) return out;
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

// bid → 매수, ask → 매도.
function sideLabel(side) {
  if (side === "bid") return "매수";
  if (side === "ask") return "매도";
  return side == null || side === "" ? DASH : String(side);
}

// 주문/이전/입출금 상태 문자열 → 배지 정보.
function stateBadge(state) {
  if (state == null || state === "") return null;
  const s = String(state);
  const low = s.toLowerCase();
  const POS = ["done", "accepted", "completed"];
  const WARN = ["cancel", "cancelled", "canceled", "failed", "rejected"];
  const NEUTRAL = ["wait", "watch", "submitted", "processing"];
  let tone = "neutral";
  if (POS.includes(low)) tone = "pos";
  else if (WARN.includes(low)) tone = "warn";
  else if (NEUTRAL.includes(low)) tone = "neutral";
  return { text: s, tone };
}

// 포켓 참조 → "이름 (uuid앞8)". 객체면 이름+괄호, 문자열이면 그대로.
function fmtPocketRef(ref) {
  if (ref == null) return DASH;
  if (typeof ref === "string") return ref || DASH;
  const name = ref?.name ?? ref?.pocket_name;
  const uuid = ref?.uuid ?? ref?.pocket_uuid;
  const short = uuid ? String(uuid).slice(0, 8) : "";
  if (name && short) return `${name} (${short})`;
  if (name) return String(name);
  if (uuid) return String(uuid);
  return DASH;
}

// row 빌더 — value 가 비면 호출 측에서 필터링.
function row(label, value, opts = {}) {
  return { label, value, ...opts };
}

// rows 배열에서 비어있는 value 를 가진 row 제거.
function cleanRows(rows) {
  return (rows || []).filter((r) => r && !isEmptyVal(r.value));
}

// RISE/FALL/EVEN → 등락 배지.
function changeBadge(change) {
  if (change == null || change === "") return null;
  const c = String(change).toUpperCase();
  if (c === "RISE") return { text: "상승", tone: "pos" };
  if (c === "FALL") return { text: "하락", tone: "neg" };
  if (c === "EVEN") return { text: "보합", tone: "neutral" };
  return { text: String(change), tone: "neutral" };
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// 배열 상위 N건 + 초과 안내 note 생성.
function overflowNote(arr, shown) {
  if (arr.length > shown) return `상위 ${shown}건 표시 · 전체 ${arr.length}건`;
  return undefined;
}

// ---------------------------------------------------------------------------
// 패밀리 매핑
// ---------------------------------------------------------------------------

function sumAccountsList(arr) {
  const items = arr.slice(0, 20).map((a) => {
    const rows = cleanRows([
      row("잔고(balance)", fmtNum(a?.balance), { mono: true }),
      row("주문중(locked)", fmtNum(a?.locked), { mono: true }),
      row("매수평균가", fmtNum(a?.avg_buy_price), { mono: true }),
    ]);
    return { title: a?.currency ?? DASH, rows };
  });
  return {
    kind: "list",
    title: `보유 자산 ${arr.length}종`,
    rows: [],
    items,
    note: overflowNote(arr, 20),
  };
}

function sumTicker(arr) {
  const items = arr.map((t) => {
    const rows = cleanRows([
      row("현재가", fmtNum(t?.trade_price), { mono: true }),
      row("전일대비", fmtPct(t?.signed_change_rate), {
        mono: true,
        tone: t?.change === "RISE" ? "pos" : t?.change === "FALL" ? "neg" : "muted",
      }),
      row("고가", fmtNum(t?.high_price), { mono: true }),
      row("저가", fmtNum(t?.low_price), { mono: true }),
      row("거래량(24h)", fmtNum(t?.acc_trade_volume_24h), { mono: true }),
    ]);
    return { title: t?.market ?? DASH, rows, badge: changeBadge(t?.change) };
  });
  return {
    kind: "list",
    title: `현재가 ${arr.length}종`,
    rows: [],
    items,
  };
}

function sumOrderbook(arr) {
  const items = arr.map((ob) => {
    const units = asArray(ob?.orderbook_units);
    const best = units[0];
    const ask = best?.ask_price;
    const bid = best?.bid_price;
    let spread = DASH;
    if (Number.isFinite(Number(ask)) && Number.isFinite(Number(bid))) {
      spread = fmtNum(Number(ask) - Number(bid));
    }
    const rows = cleanRows([
      row("최우선 매도호가", fmtNum(ask), { mono: true, tone: "neg" }),
      row("최우선 매수호가", fmtNum(bid), { mono: true, tone: "pos" }),
      row("스프레드", spread, { mono: true }),
      row("매도 잔량", fmtNum(best?.ask_size), { mono: true }),
      row("매수 잔량", fmtNum(best?.bid_size), { mono: true }),
      row("총 매도잔량", fmtNum(ob?.total_ask_size), { mono: true }),
      row("총 매수잔량", fmtNum(ob?.total_bid_size), { mono: true }),
    ]);
    return { title: ob?.market ?? DASH, rows };
  });
  return {
    kind: "list",
    title: `호가 ${arr.length}종`,
    rows: [],
    items,
  };
}

function sumChance(o) {
  const market = o?.market;
  const rows = cleanRows([
    row("마켓", market?.id ?? DASH, { mono: true }),
    row("매수 수수료", fmtPct(o?.bid_fee)),
    row("매도 수수료", fmtPct(o?.ask_fee)),
    row("매수가능 KRW", fmtNum(o?.bid_account?.balance), { mono: true, tone: "pos" }),
    row(
      "매도가능 수량",
      fmtNum(o?.ask_account?.balance),
      { mono: true, tone: "pos" }
    ),
    row("매도 통화", o?.ask_account?.currency ?? DASH),
  ]);
  return { kind: "object", title: "주문 가능 정보", rows };
}

// 단일 주문 객체 → object Summary.
function orderRows(o) {
  return cleanRows([
    row("uuid", o?.uuid, { mono: true }),
    row("마켓", o?.market, { mono: true }),
    row("종류", sideLabel(o?.side)),
    row("주문유형", o?.ord_type),
    row("상태", o?.state),
    row("가격", fmtNum(o?.price), { mono: true }),
    row("수량(volume)", fmtNum(o?.volume), { mono: true }),
    row("체결수량", fmtNum(o?.executed_volume), { mono: true }),
    row("남은수량", fmtNum(o?.remaining_volume), { mono: true }),
    row("지불수수료", fmtNum(o?.paid_fee), { mono: true }),
    row("생성시각", fmtTime(o?.created_at)),
    row("identifier", o?.identifier, { mono: true }),
  ]);
}

function sumOrderSingle(o) {
  return {
    kind: "object",
    title: `주문 ${sideLabel(o?.side)} · ${o?.market ?? DASH}`,
    rows: orderRows(o),
    error: undefined,
    ...(stateBadge(o?.state) ? { badge: stateBadge(o?.state) } : {}),
  };
}

function sumOrderList(arr) {
  const SHOWN = 15;
  const items = arr.slice(0, SHOWN).map((o) => {
    const rows = cleanRows([
      row("마켓", o?.market, { mono: true }),
      row("종류", sideLabel(o?.side)),
      row("주문유형", o?.ord_type),
      row("가격", fmtNum(o?.price), { mono: true }),
      row("수량", fmtNum(o?.volume), { mono: true }),
      row("체결", fmtNum(o?.executed_volume), { mono: true }),
      row("생성시각", fmtTime(o?.created_at)),
    ]);
    return {
      title: o?.identifier || (o?.uuid ? String(o.uuid).slice(0, 8) : DASH),
      rows,
      badge: stateBadge(o?.state),
    };
  });
  return {
    kind: "list",
    title: `주문 ${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

// 입출금 단건 row.
function transferLikeRows(o) {
  return cleanRows([
    row("uuid", o?.uuid, { mono: true }),
    row("통화", o?.currency),
    row("네트워크", o?.net_type),
    row("수량/금액", fmtNum(o?.amount), { mono: true }),
    row("수수료", fmtNum(o?.fee), { mono: true }),
    row("상태", o?.state),
    row("txid", o?.txid, { mono: true }),
    row("생성시각", fmtTime(o?.created_at)),
    row("완료시각", fmtTime(o?.done_at)),
  ]);
}

function sumDepWithSingle(o, what) {
  return {
    kind: "object",
    title: `${what} · ${o?.currency ?? DASH}`,
    rows: transferLikeRows(o),
    ...(stateBadge(o?.state) ? { badge: stateBadge(o?.state) } : {}),
  };
}

function sumDepWithList(arr, what) {
  const SHOWN = 15;
  const items = arr.slice(0, SHOWN).map((o) => {
    const rows = cleanRows([
      row("통화", o?.currency),
      row("수량/금액", fmtNum(o?.amount), { mono: true }),
      row("네트워크", o?.net_type),
      row("txid", o?.txid, { mono: true }),
      row("uuid", o?.uuid, { mono: true }),
      row("시각", fmtTime(o?.created_at)),
    ]);
    return {
      title: `${o?.currency ?? DASH} ${fmtNum(o?.amount)}`,
      rows,
      badge: stateBadge(o?.state),
    };
  });
  return {
    kind: "list",
    title: `${what} ${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

function sumCoinAddress(o) {
  const addr = o?.deposit_address;
  const rows = cleanRows([
    row("통화", o?.currency),
    row("네트워크", o?.net_type),
    row("입금주소", addr, { mono: true }),
    row("2차주소/태그", o?.secondary_address, { mono: true }),
  ]);
  return {
    kind: "object",
    title: `입금 주소 · ${o?.currency ?? DASH}`,
    rows,
    note: isEmptyVal(addr) ? "입금 주소가 아직 발급되지 않았습니다(비동기 생성 대기 가능)." : undefined,
  };
}

function sumCoinAddresses(arr) {
  const SHOWN = 15;
  const items = arr.slice(0, SHOWN).map((o) => {
    const rows = cleanRows([
      row("통화", o?.currency),
      row("네트워크", o?.net_type),
      row("주소", o?.deposit_address ?? o?.withdraw_address, { mono: true }),
      row("2차주소/태그", o?.secondary_address, { mono: true }),
    ]);
    return { title: `${o?.currency ?? DASH}/${o?.net_type ?? DASH}`, rows };
  });
  return {
    kind: "list",
    title: `주소 ${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

function sumWithdrawChance(o) {
  const cur = o?.currency;
  const acc = o?.account;
  const limit = o?.withdraw_limit;
  const rows = cleanRows([
    row("통화", cur?.code ?? acc?.currency ?? DASH),
    row("출금가능 잔고", fmtNum(acc?.balance), { mono: true, tone: "pos" }),
    row("최소 출금", fmtNum(limit?.minimum), { mono: true }),
    row("1회 한도", fmtNum(limit?.onetime), { mono: true }),
    row("출금 수수료", fmtNum(o?.currency?.withdraw_fee), { mono: true }),
  ]);
  return { kind: "object", title: "출금 가능 정보", rows };
}

function sumPocketsList(body) {
  const arr = Array.isArray(body) ? body : asArray(body?.pockets);
  const items = arr.map((p) => {
    const type = p?.pocket_type;
    const isMain = String(type).toLowerCase() === "main";
    const rows = cleanRows([
      row("유형", type),
      row("uuid", p?.uuid, { mono: true }),
    ]);
    return {
      title: p?.name ?? "(이름없음)",
      rows,
      badge: { text: isMain ? "메인" : "서브", tone: isMain ? "pos" : "neutral" },
    };
  });
  return {
    kind: "list",
    title: `포켓 ${arr.length}개`,
    rows: [],
    items,
  };
}

function sumPocketAssets(body) {
  const arr = Array.isArray(body) ? body : asArray(body?.assets);
  const items = arr.map((a) => {
    const rows = cleanRows([
      row("잔고(balance)", fmtNum(a?.balance), { mono: true }),
      row("주문중(locked)", fmtNum(a?.locked), { mono: true }),
    ]);
    return { title: a?.currency ?? DASH, rows };
  });
  return {
    kind: "list",
    title: `포켓 잔고 ${arr.length}종`,
    rows: [],
    items,
  };
}

function transferObjRows(o) {
  return cleanRows([
    row("identifier", o?.identifier, { mono: true }),
    row("from", fmtPocketRef(o?.from)),
    row("to", fmtPocketRef(o?.to)),
    row("통화", o?.currency),
    row("수량", fmtNum(o?.amount), { mono: true }),
    row("상태", o?.state),
    row("생성시각", fmtTime(o?.created_at)),
  ]);
}

function sumTransferSingle(o) {
  return {
    kind: "object",
    title: `자산 이전 · ${o?.currency ?? DASH}`,
    rows: transferObjRows(o),
    ...(stateBadge(o?.state) ? { badge: stateBadge(o?.state) } : {}),
  };
}

function sumTransferList(arr) {
  const SHOWN = 15;
  const items = arr.slice(0, SHOWN).map((o) => {
    const rows = cleanRows([
      row("from", fmtPocketRef(o?.from)),
      row("to", fmtPocketRef(o?.to)),
      row("통화", o?.currency),
      row("수량", fmtNum(o?.amount), { mono: true }),
      row("시각", fmtTime(o?.created_at)),
    ]);
    return {
      title: o?.identifier || `${o?.currency ?? DASH} ${fmtNum(o?.amount)}`,
      rows,
      badge: stateBadge(o?.state),
    };
  });
  return {
    kind: "list",
    title: `자산 이전 ${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

function sumMarketAll(arr) {
  return {
    kind: "list",
    title: `마켓 ${arr.length}개`,
    rows: [],
    items: [],
    note: `거래 가능 마켓 ${arr.length}건 (목록은 원본 JSON 참조).`,
  };
}

function sumCandlesOrTrades(arr) {
  const SHOWN = 5;
  const items = arr.slice(0, SHOWN).map((c) => {
    const rows = cleanRows([
      row("시각", fmtTime(c?.candle_date_time_kst ?? c?.trade_date_kst ?? c?.timestamp)),
      row("체결가", fmtNum(c?.trade_price), { mono: true }),
      row("거래량", fmtNum(c?.candle_acc_trade_volume ?? c?.trade_volume), { mono: true }),
    ]);
    return { title: c?.market ?? DASH, rows };
  });
  return {
    kind: "list",
    title: `${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

// 제네릭 배열 요약 — 패밀리 매핑이 없을 때.
function sumGenericList(arr) {
  const SHOWN = 10;
  const items = arr.slice(0, SHOWN).map((el, i) => {
    if (el && typeof el === "object" && !Array.isArray(el)) {
      const keys = Object.keys(el).slice(0, 4);
      const rows = cleanRows(
        keys.map((k) => {
          const v = el[k];
          const str =
            v == null
              ? DASH
              : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
          return row(k, str, { mono: true });
        })
      );
      return { title: `#${i + 1}`, rows };
    }
    return { title: `#${i + 1}`, rows: [row("값", String(el), { mono: true })] };
  });
  return {
    kind: "list",
    title: `${arr.length}건`,
    rows: [],
    items,
    note: overflowNote(arr, SHOWN),
  };
}

// ---------------------------------------------------------------------------
// 에러 요약
// ---------------------------------------------------------------------------
function sumError(name, message) {
  const friendly = name && UPBIT_ERROR_DICT[name] ? UPBIT_ERROR_DICT[name] : "";
  return {
    kind: "error",
    title: "오류",
    rows: [],
    error: {
      name: name ?? "",
      message: message ?? "",
      friendly,
    },
  };
}

// ---------------------------------------------------------------------------
// 패밀리 디스패치 — endpointId → Summary | null
// ---------------------------------------------------------------------------
function dispatch(endpointId, body) {
  const arr = asArray(body);
  switch (endpointId) {
    // 계좌
    case "accounts.list":
      return sumAccountsList(arr);
    case "accounts.chance":
      return sumChance(body);

    // 시세
    case "quotation.ticker":
      return sumTicker(arr);
    case "quotation.orderbook":
      return sumOrderbook(arr);
    case "quotation.market_all":
      return sumMarketAll(arr);
    case "quotation.candles_minutes":
    case "quotation.candles_days":
    case "quotation.candles_weeks":
    case "quotation.candles_months":
    case "quotation.trades_ticks":
      return sumCandlesOrTrades(arr);

    // 주문
    case "orders.create":
    case "orders.get":
    case "orders.cancel":
      return sumOrderSingle(body);
    case "orders.open":
    case "orders.closed":
    case "orders.uuids":
      return sumOrderList(arr);

    // 입금
    case "deposits.list":
      return sumDepWithList(arr, "입금");
    case "deposits.get":
      return sumDepWithSingle(body, "입금");
    case "deposits.coin_address":
    case "deposits.generate_coin_address":
      return sumCoinAddress(body);
    case "deposits.coin_addresses":
      return sumCoinAddresses(arr);

    // 출금
    case "withdraws.list":
      return sumDepWithList(arr, "출금");
    case "withdraws.get":
      return sumDepWithSingle(body, "출금");
    case "withdraws.coin_addresses":
      return sumCoinAddresses(arr);
    case "withdraws.chance":
      return sumWithdrawChance(body);

    // 포켓
    case "pockets.list":
      return sumPocketsList(body);
    case "pockets.assets":
      return sumPocketAssets(body);
    case "pockets.universal_transfers.create":
    case "pockets.transfers.create":
      return sumTransferSingle(body);
    case "pockets.universal_transfers.list":
    case "pockets.transfers.list":
      return sumTransferList(arr);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------
export function summarize(endpointId, body, status) {
  try {
    // 본문 없음 / 원시 텍스트 응답이면 요약하지 않는다.
    if (body == null) return null;
    if (typeof body === "object" && !Array.isArray(body) && body._raw !== undefined)
      return null;

    // 업비트식 에러 객체.
    if (body && typeof body === "object" && !Array.isArray(body) && body.error) {
      const e = body.error;
      return sumError(e?.name, e?.message);
    }

    // 상태 코드가 4xx/5xx 인데 error 객체가 없으면 일반 오류 요약.
    if (typeof status === "number" && status >= 400) {
      return sumError("", `HTTP ${status} 오류 응답`);
    }

    // 정상 바디 → 패밀리 분기.
    const fromFamily = dispatch(endpointId, body);
    if (fromFamily) return fromFamily;

    // 매핑 없음: 배열이면 제네릭 요약, 객체면 null.
    if (Array.isArray(body)) return sumGenericList(body);
    return null;
  } catch {
    // 절대 throw 하지 않는다.
    return null;
  }
}
