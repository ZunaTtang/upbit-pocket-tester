// ===========================================================================
// Upbit endpoint catalog.
//
// Each descriptor drives an auto-generated form + call + req/resp viewer. Write
// endpoints additionally declare a `verify` pairing: the read endpoint to run
// right after, how to pre-fill it from what we just sent, and the human
// checklist to tick off while eyeballing the result.
//
// Paths follow the classic Upbit REST surface (https://api.upbit.com/v1/...).
// Because every call shows its full URL and the base URL is configurable,
// any single path is trivially corrected if Upbit's docs drift.
// ===========================================================================

export const PERMISSIONS = [
  { key: "asset_view", label: "자산조회" },
  { key: "order_view", label: "주문조회" },
  { key: "order", label: "주문하기" },
  { key: "deposit_view", label: "입금조회" },
  { key: "deposit", label: "입금하기" },
  { key: "withdraw_view", label: "출금조회" },
  { key: "withdraw", label: "출금하기" },
  { key: "pocket_manage", label: "포켓관리" },
  { key: "transfer", label: "자산이전" },
];

export const PERMISSION_LABEL = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p.label])
);

// Default verification checklist items reused by most write actions.
const CHK_IDENTIFIER = { key: "identifier", label: "보낸 identifier가 조회 결과에 있는가" };
const CHK_AMOUNT = { key: "amount", label: "금액·통화가 보낸 값과 일치하는가" };
const CHK_DONE = { key: "done", label: "상태가 done(완료)인가" };

// helper: pull identifier or uuid out of a create-response body
function respId(body, field) {
  if (!body) return "";
  if (Array.isArray(body)) return body[0] ? body[0][field] || "" : "";
  return body[field] || "";
}

export const CATEGORIES = [
  { id: "quotation", label: "1. 시세", auth: false },
  { id: "accounts", label: "2. 계좌", auth: true },
  { id: "orders", label: "3. 주문", auth: true },
  { id: "deposits", label: "4. 외부 입금 검증", auth: true, pocketType: "main" },
  { id: "withdraws", label: "5. 외부 출금 검증", auth: true, pocketType: "main" },
  { id: "pockets", label: "6. 포켓 자산 이전", auth: true },
];

// ---- field shorthands -----------------------------------------------------
const f = {
  market: (req = true) => ({ name: "market", label: "마켓 코드", type: "text", required: req, placeholder: "KRW-BTC" }),
  currency: (req = true) => ({ name: "currency", label: "통화(currency)", type: "text", required: req, placeholder: "BTC / KRW" }),
  netType: () => ({ name: "net_type", label: "네트워크(net_type)", type: "text", placeholder: "예: BTC, ETH, TRX (멀티 네트워크 코인 필수)" }),
  amount: () => ({ name: "amount", label: "수량/금액(amount, 문자열 decimal)", type: "decimal", required: true, placeholder: "0.0 — 부동소수 금지, 문자열로 처리" }),
  limit: (d) => ({ name: "limit", label: "limit", type: "number", placeholder: String(d), default: String(d) }),
  orderBy: (d = "desc") => ({ name: "order_by", label: "order_by", type: "select", options: ["desc", "asc"], default: d }),
  startTime: () => ({ name: "start_time", label: "start_time (ISO8601 또는 ms, UTC)", type: "datetime" }),
  endTime: () => ({ name: "end_time", label: "end_time (ISO8601 또는 ms, UTC)", type: "datetime" }),
  identifier: () => ({ name: "identifier", label: "identifier (1~64자 / 영숫자 _ . - / 1회용)", type: "identifier", autogen: true }),
};

// ---------------------------------------------------------------------------
// THE CATALOG
// ---------------------------------------------------------------------------
export const ENDPOINTS = [
  // ---- 1. 시세 (인증 불필요) ----------------------------------------------
  {
    id: "quotation.market_all", category: "quotation", method: "GET", path: "/v1/market/all",
    auth: false, label: "마켓 코드 조회", desc: "거래 가능한 마켓 목록.",
    fields: [{ name: "is_details", label: "상세 정보 포함(is_details)", type: "bool" }],
  },
  {
    id: "quotation.ticker", category: "quotation", method: "GET", path: "/v1/ticker",
    auth: false, label: "현재가(Ticker)", desc: "지정 마켓들의 현재가 스냅샷.",
    fields: [{ name: "markets", label: "마켓들(markets, 콤마구분)", type: "text", required: true, placeholder: "KRW-BTC,KRW-ETH" }],
  },
  {
    id: "quotation.orderbook", category: "quotation", method: "GET", path: "/v1/orderbook",
    auth: false, label: "호가(Orderbook)", desc: "지정 마켓들의 호가 정보.",
    fields: [
      { name: "markets", label: "마켓들(markets, 콤마구분)", type: "text", required: true, placeholder: "KRW-BTC,KRW-ETH" },
      { name: "level", label: "호가 모아보기 단위(level)", type: "number" },
    ],
  },
  {
    id: "quotation.candles_minutes", category: "quotation", method: "GET",
    path: (p) => `/v1/candles/minutes/${p.unit || 1}`,
    auth: false, label: "분(Minute) 캔들", desc: "unit은 경로에 포함됩니다.",
    fields: [
      { name: "unit", label: "단위(분)", type: "select", options: ["1", "3", "5", "10", "15", "30", "60", "240"], default: "1", pathOnly: true },
      f.market(true),
      { name: "to", label: "to (마지막 캔들 시각, opt)", type: "datetime" },
      { name: "count", label: "count(최대 200)", type: "number", placeholder: "200" },
    ],
  },
  {
    id: "quotation.candles_days", category: "quotation", method: "GET", path: "/v1/candles/days",
    auth: false, label: "일(Day) 캔들",
    fields: [f.market(true), { name: "to", label: "to", type: "datetime" }, { name: "count", label: "count", type: "number", placeholder: "200" }, { name: "convertingPriceUnit", label: "환산 통화(convertingPriceUnit)", type: "text", placeholder: "KRW" }],
  },
  {
    id: "quotation.candles_weeks", category: "quotation", method: "GET", path: "/v1/candles/weeks",
    auth: false, label: "주(Week) 캔들",
    fields: [f.market(true), { name: "to", label: "to", type: "datetime" }, { name: "count", label: "count", type: "number", placeholder: "200" }],
  },
  {
    id: "quotation.candles_months", category: "quotation", method: "GET", path: "/v1/candles/months",
    auth: false, label: "월(Month) 캔들",
    fields: [f.market(true), { name: "to", label: "to", type: "datetime" }, { name: "count", label: "count", type: "number", placeholder: "200" }],
  },
  {
    id: "quotation.trades_ticks", category: "quotation", method: "GET", path: "/v1/trades/ticks",
    auth: false, label: "최근 체결(Trades)",
    fields: [f.market(true), { name: "to", label: "to(HHmmss/HH:mm:ss)", type: "text" }, { name: "count", label: "count", type: "number" }, { name: "cursor", label: "cursor", type: "text" }, { name: "daysAgo", label: "daysAgo(1~7)", type: "number" }],
  },

  // ---- 2. 계좌 ------------------------------------------------------------
  {
    id: "accounts.list", category: "accounts", method: "GET", path: "/v1/accounts",
    auth: true, permission: "asset_view", label: "전체 계좌 조회", desc: "보유 자산 목록.",
    fields: [],
  },
  {
    id: "accounts.chance", category: "accounts", method: "GET", path: "/v1/orders/chance",
    auth: true, permission: "order_view", label: "주문 가능 정보(orders/chance)",
    fields: [f.market(true)],
  },

  // ---- 3. 주문 ------------------------------------------------------------
  {
    id: "orders.create", category: "orders", method: "POST", path: "/v1/orders",
    auth: true, permission: "order", write: true, label: "주문하기(매수/매도)",
    desc: "지정가=volume+price / 시장가 매수(price)=price만 / 시장가 매도(market)=volume만.",
    fields: [
      f.market(true),
      { name: "side", label: "side", type: "select", options: ["bid", "ask"], required: true, help: "bid=매수, ask=매도" },
      { name: "ord_type", label: "ord_type", type: "select", options: ["limit", "price", "market", "best"], default: "limit" },
      { name: "volume", label: "volume(수량, decimal)", type: "decimal", placeholder: "지정가/시장가매도 시 필요" },
      { name: "price", label: "price(가격/총액, decimal)", type: "decimal", placeholder: "지정가/시장가매수 시 필요" },
      f.identifier(),
      { name: "time_in_force", label: "time_in_force(opt)", type: "select", options: ["", "ioc", "fok", "post_only"], default: "" },
      { name: "smp_type", label: "smp_type(opt)", type: "select", options: ["", "reduce", "cancel_maker", "cancel_taker"], default: "" },
    ],
    guard: (p) => {
      let amt = null;
      if (p.ord_type === "limit" && p.price && p.volume) amt = String(Number(p.price) * Number(p.volume));
      else if (p.ord_type === "price" && p.price) amt = String(p.price);
      if (!amt) return null;
      return { cap_key: "limit_order_krw", amount: amt, label: "주문 KRW 총액" };
    },
    verify: {
      title: "검증: 방금 생성한 주문을 조회로 대조",
      pairEndpointId: "orders.get",
      buildParams: (sent, resp) => ({
        uuid: respId(resp, "uuid"),
        identifier: sent.identifier || respId(resp, "identifier"),
      }),
      checklist: [CHK_IDENTIFIER, CHK_AMOUNT, { key: "state", label: "상태(state)가 의도대로인가 (wait/done 등)" }],
    },
  },
  {
    id: "orders.get", category: "orders", method: "GET", path: "/v1/order",
    auth: true, permission: "order_view", label: "개별 주문 조회", desc: "uuid 또는 identifier 중 하나.",
    fields: [{ name: "uuid", label: "uuid", type: "text" }, { name: "identifier", label: "identifier", type: "text" }],
  },
  {
    id: "orders.open", category: "orders", method: "GET", path: "/v1/orders/open",
    auth: true, permission: "order_view", label: "미체결 주문 리스트(open)",
    fields: [{ name: "market", label: "market", type: "text" }, { name: "state", label: "state", type: "select", options: ["", "wait", "watch"], default: "" }, { name: "states", label: "states[](콤마: wait,watch)", type: "array" }, { name: "page", label: "page", type: "number" }, f.limit(100), f.orderBy("desc")],
  },
  {
    id: "orders.closed", category: "orders", method: "GET", path: "/v1/orders/closed",
    auth: true, permission: "order_view", label: "종료 주문 리스트(closed)",
    fields: [{ name: "market", label: "market", type: "text" }, { name: "state", label: "state", type: "select", options: ["", "done", "cancel"], default: "" }, { name: "states", label: "states[](콤마: done,cancel)", type: "array" }, f.startTime(), f.endTime(), f.limit(100), f.orderBy("desc")],
  },
  {
    id: "orders.uuids", category: "orders", method: "GET", path: "/v1/orders/uuids",
    auth: true, permission: "order_view", label: "id로 주문 리스트 조회",
    fields: [{ name: "market", label: "market", type: "text" }, { name: "uuids", label: "uuids[](콤마)", type: "array" }, { name: "identifiers", label: "identifiers[](콤마)", type: "array" }, f.orderBy("desc")],
  },
  {
    id: "orders.cancel", category: "orders", method: "DELETE", path: "/v1/order",
    auth: true, permission: "order", write: true, label: "주문 취소(개별)", desc: "uuid 또는 identifier.",
    fields: [{ name: "uuid", label: "uuid", type: "text" }, { name: "identifier", label: "identifier", type: "text" }],
    verify: {
      title: "검증: 취소된 주문을 조회로 대조",
      pairEndpointId: "orders.get",
      buildParams: (sent) => ({ uuid: sent.uuid, identifier: sent.identifier }),
      checklist: [{ key: "cancel", label: "상태(state)가 cancel 로 바뀌었는가" }],
    },
  },
  {
    id: "orders.cancel_bulk", category: "orders", method: "DELETE", path: "/v1/orders/open",
    auth: true, permission: "order", write: true, label: "주문 일괄 취소",
    fields: [
      { name: "cancel_side", label: "cancel_side", type: "select", options: ["all", "ask", "bid"], default: "all" },
      { name: "pairs", label: "pairs(콤마, 대상 마켓)", type: "text", placeholder: "KRW-BTC,KRW-ETH" },
      { name: "excluded_pairs", label: "excluded_pairs(콤마)", type: "text" },
      { name: "quote_currencies", label: "quote_currencies(콤마)", type: "text", placeholder: "KRW,BTC" },
      { name: "count", label: "count(최대 300)", type: "number" },
    ],
    verify: {
      title: "검증: 일괄 취소 후 미체결 목록 재조회",
      pairEndpointId: "orders.open",
      buildParams: () => ({}),
      checklist: [{ key: "empty", label: "대상 주문들이 미체결 목록에서 사라졌는가" }],
    },
  },

  // ---- 4. 외부 입금 검증 (메인포켓 키 전용) -------------------------------
  {
    id: "deposits.generate_coin_address", category: "deposits", method: "POST", path: "/v1/deposits/generate_coin_address",
    auth: true, permission: "deposit", write: true, pocketType: "main", label: "입금 주소 생성 요청",
    desc: "최초 1회 비동기 생성될 수 있음. 생성 후 아래 '입금 주소 조회'로 확인.",
    fields: [f.currency(true), f.netType()],
    verify: {
      title: "검증: 입금 주소 조회로 주소 발급 확인",
      pairEndpointId: "deposits.coin_address",
      buildParams: (sent) => ({ currency: sent.currency, net_type: sent.net_type }),
      checklist: [{ key: "addr", label: "deposit_address 가 채워져 표시되는가" }, { key: "cur", label: "통화/네트워크가 요청과 일치하는가" }],
    },
  },
  {
    id: "deposits.coin_address", category: "deposits", method: "GET", path: "/v1/deposits/coin_address",
    auth: true, permission: "deposit_view", pocketType: "main", label: "입금 주소 조회(개별)",
    desc: "표시된 주소로 외부에서 직접 소액을 보내세요(수동).",
    fields: [f.currency(true), f.netType()], addressDisplay: true,
  },
  {
    id: "deposits.coin_addresses", category: "deposits", method: "GET", path: "/v1/deposits/coin_addresses",
    auth: true, permission: "deposit_view", pocketType: "main", label: "전체 입금 주소 조회",
    fields: [],
  },
  {
    id: "deposits.list", category: "deposits", method: "GET", path: "/v1/deposits",
    auth: true, permission: "deposit_view", pocketType: "main", label: "입금 리스트 조회",
    desc: "새로고침하며 외부 입금이 잡히는지 확인.",
    fields: [{ name: "currency", label: "currency", type: "text", placeholder: "BTC / KRW" }, { name: "state", label: "state", type: "text", placeholder: "예: ACCEPTED" }, { name: "uuids", label: "uuids[](콤마)", type: "array" }, { name: "txids", label: "txids[](콤마)", type: "array" }, { name: "page", label: "page", type: "number" }, f.limit(100), f.orderBy("desc")],
  },
  {
    id: "deposits.get", category: "deposits", method: "GET", path: "/v1/deposit",
    auth: true, permission: "deposit_view", pocketType: "main", label: "개별 입금 조회",
    fields: [{ name: "uuid", label: "uuid", type: "text" }, { name: "txid", label: "txid", type: "text" }, { name: "currency", label: "currency", type: "text" }],
  },
  {
    id: "deposits.krw", category: "deposits", method: "POST", path: "/v1/deposits/krw",
    auth: true, permission: "deposit", write: true, pocketType: "main", label: "원화 입금하기",
    fields: [{ name: "amount", label: "amount(원, decimal)", type: "decimal", required: true }, { name: "two_factor_type", label: "two_factor_type", type: "select", options: ["kakao", "naver", "hana"], default: "kakao" }],
    verify: {
      title: "검증: 원화 입금 리스트로 대조",
      pairEndpointId: "deposits.list",
      buildParams: () => ({ currency: "KRW", limit: "10" }),
      checklist: [CHK_AMOUNT, { key: "appear", label: "방금 입금이 목록에 나타나는가" }],
    },
  },

  // ---- 5. 외부 출금 검증 (메인포켓 키 전용) -------------------------------
  {
    id: "withdraws.chance", category: "withdraws", method: "GET", path: "/v1/withdraws/chance",
    auth: true, permission: "withdraw_view", pocketType: "main", label: "출금 가능 정보 조회",
    fields: [f.currency(true), f.netType()],
  },
  {
    id: "withdraws.coin_addresses", category: "withdraws", method: "GET", path: "/v1/withdraws/coin_addresses",
    auth: true, permission: "withdraw_view", pocketType: "main", label: "출금 허용 주소 리스트 조회",
    desc: "주소 등록은 업비트 웹에서만 가능. 여기서는 등록된 주소만 보입니다.",
    fields: [],
  },
  {
    id: "withdraws.list", category: "withdraws", method: "GET", path: "/v1/withdraws",
    auth: true, permission: "withdraw_view", pocketType: "main", label: "출금 리스트 조회",
    fields: [{ name: "currency", label: "currency", type: "text" }, { name: "state", label: "state", type: "text", placeholder: "예: DONE" }, { name: "uuids", label: "uuids[](콤마)", type: "array" }, { name: "txids", label: "txids[](콤마)", type: "array" }, { name: "page", label: "page", type: "number" }, f.limit(100), f.orderBy("desc")],
  },
  {
    id: "withdraws.get", category: "withdraws", method: "GET", path: "/v1/withdraw",
    auth: true, permission: "withdraw_view", pocketType: "main", label: "개별 출금 조회",
    fields: [{ name: "uuid", label: "uuid", type: "text" }, { name: "txid", label: "txid", type: "text" }, { name: "currency", label: "currency", type: "text" }],
  },
  {
    id: "withdraws.coin", category: "withdraws", method: "POST", path: "/v1/withdraws/coin",
    auth: true, permission: "withdraw", write: true, pocketType: "main", label: "디지털 자산 출금 요청",
    desc: "address 는 등록된 허용 주소만 드롭다운에서 선택.",
    fields: [
      f.currency(true), f.netType(), f.amount(),
      { name: "address", label: "출금 주소(등록된 허용 주소)", type: "dynamic-select", required: true,
        dynamic: { endpointId: "withdraws.coin_addresses", dependsOn: ["currency", "net_type"],
          map: (body, p) => (Array.isArray(body) ? body : []).filter((a) => !p.currency || a.currency === p.currency).map((a) => ({ value: a.withdraw_address, label: `${a.currency}/${a.net_type || "-"} · ${a.withdraw_address}`, secondary: a.secondary_address })) } },
      { name: "secondary_address", label: "2차 주소/태그(secondary_address, opt)", type: "text" },
      { name: "transaction_type", label: "transaction_type", type: "select", options: ["default", "internal"], default: "default" },
    ],
    guard: (p) => (p.amount ? { cap_key: "limit_withdraw_coin", amount: String(p.amount), label: "코인 출금 수량" } : null),
    verify: {
      title: "검증: 출금 리스트로 대조",
      pairEndpointId: "withdraws.list",
      buildParams: (sent, resp) => ({ currency: sent.currency, uuids: [respId(resp, "uuid")].filter(Boolean), limit: "10" }),
      checklist: [{ key: "uuid", label: "응답 uuid 가 목록에 있는가" }, CHK_AMOUNT, { key: "state", label: "상태(state)가 진행/완료로 보이는가" }],
    },
  },
  {
    id: "withdraws.krw", category: "withdraws", method: "POST", path: "/v1/withdraws/krw",
    auth: true, permission: "withdraw", write: true, pocketType: "main", label: "원화 출금 요청",
    fields: [{ name: "amount", label: "amount(원, decimal)", type: "decimal", required: true }, { name: "two_factor_type", label: "two_factor_type", type: "select", options: ["kakao", "naver", "hana"], default: "kakao" }],
    guard: (p) => (p.amount ? { cap_key: "limit_withdraw_krw", amount: String(p.amount), label: "원화 출금액" } : null),
    verify: {
      title: "검증: 원화 출금 리스트로 대조",
      pairEndpointId: "withdraws.list",
      buildParams: (sent, resp) => ({ currency: "KRW", uuids: [respId(resp, "uuid")].filter(Boolean), limit: "10" }),
      checklist: [{ key: "uuid", label: "응답 uuid 가 목록에 있는가" }, CHK_AMOUNT, CHK_DONE],
    },
  },

  // ---- 6. 포켓 자산 이전 --------------------------------------------------
  {
    id: "pockets.list", category: "pockets", method: "GET", path: "/v1/pockets",
    auth: true, permission: "pocket_manage", pocketType: "main", label: "(a) 포켓 정보 조회",
    desc: "메인/서브 UUID·이름. from/to/uuid 드롭다운의 소스.", fields: [], refreshesPockets: true,
  },
  {
    id: "pockets.api_keys", category: "pockets", method: "GET", path: "/v1/pockets/api_keys",
    auth: true, permission: "pocket_manage", pocketType: "main", label: "(b) 포켓별 API Key 목록",
    fields: [{ name: "uuids", label: "uuids[](포켓 선택)", type: "pocket-array" }, { name: "include_expired", label: "include_expired", type: "bool" }],
  },
  {
    id: "pockets.assets", category: "pockets", method: "GET", path: "/v1/pockets/assets",
    auth: true, permission: "pocket_manage", pocketType: "main", label: "(c) 서브포켓 잔고 조회",
    fields: [{ name: "uuid", label: "uuid(포켓, required)", type: "pocket", required: true }],
  },
  {
    id: "pockets.universal_transfers.create", category: "pockets", method: "POST", path: "/v1/pockets/universal_transfers",
    auth: true, permission: "pocket_manage", pocketType: "main", write: true, label: "(d) 메인포켓 자산 이전",
    desc: "메인↔서브 / 서브↔서브. from 미지정 시 키 포켓. from≠to.",
    fields: [
      { name: "from", label: "from(미지정 시 키 포켓)", type: "pocket" },
      { name: "to", label: "to(required)", type: "pocket", required: true },
      f.currency(true), f.amount(), f.identifier(),
    ],
    guard: (p) => (p.amount ? { cap_key: "limit_transfer", amount: String(p.amount), label: "이전 수량" } : null),
    requireFromToDiffer: true,
    verify: {
      title: "검증: 메인포켓 이전 목록으로 대조",
      pairEndpointId: "pockets.universal_transfers.list",
      buildParams: (sent) => ({ identifiers: [sent.identifier].filter(Boolean), currency: sent.currency, limit: "10" }),
      checklist: [CHK_IDENTIFIER, CHK_AMOUNT, { key: "state", label: "상태가 submitted→processing→done 흐름인가" }],
    },
  },
  {
    id: "pockets.universal_transfers.list", category: "pockets", method: "GET", path: "/v1/pockets/universal_transfers",
    auth: true, permission: "pocket_manage", pocketType: "main", label: "(e) 메인포켓 이전 목록",
    maxRangeDays: 7,
    fields: [
      { name: "from", label: "from", type: "pocket" }, { name: "to", label: "to", type: "pocket" },
      { name: "states", label: "states[](콤마: submitted,processing,done,failed)", type: "array" },
      { name: "uuids", label: "uuids[](포켓)", type: "pocket-array" },
      { name: "identifiers", label: "identifiers[](콤마)", type: "array" },
      f.startTime(), f.endTime(), { name: "currency", label: "currency", type: "text" }, f.limit(20), f.orderBy("desc"),
    ],
  },
  {
    id: "pockets.transfers.create", category: "pockets", method: "POST", path: "/v1/pockets/transfers",
    auth: true, permission: "transfer", pocketType: "sub", write: true, label: "(f) 서브포켓 자산 이전",
    desc: "from 은 키의 서브포켓 고정. 서브→메인 / 서브→서브. to 미지정 시 메인포켓.",
    fields: [
      { name: "to", label: "to(미지정 시 메인포켓)", type: "pocket" },
      f.currency(true), f.amount(), f.identifier(),
    ],
    guard: (p) => (p.amount ? { cap_key: "limit_transfer", amount: String(p.amount), label: "이전 수량" } : null),
    verify: {
      title: "검증: 서브포켓 이전 목록으로 대조",
      pairEndpointId: "pockets.transfers.list",
      buildParams: (sent) => ({ direction: "all", identifiers: [sent.identifier].filter(Boolean), currency: sent.currency, limit: "10" }),
      checklist: [CHK_IDENTIFIER, CHK_AMOUNT, { key: "state", label: "상태가 submitted→processing→done 흐름인가" }],
    },
  },
  {
    id: "pockets.transfers.list", category: "pockets", method: "GET", path: "/v1/pockets/transfers",
    auth: true, permission: "transfer", pocketType: "sub", label: "(g) 서브포켓 이전 목록",
    maxRangeDays: 7,
    fields: [
      { name: "direction", label: "direction", type: "select", options: ["all", "in", "out"], default: "all" },
      { name: "to", label: "to", type: "pocket" },
      { name: "states", label: "states[](콤마)", type: "array" },
      { name: "uuids", label: "uuids[](포켓)", type: "pocket-array" },
      { name: "identifiers", label: "identifiers[](콤마)", type: "array" },
      f.startTime(), f.endTime(), { name: "currency", label: "currency", type: "text" }, f.limit(20), f.orderBy("desc"),
    ],
  },
];

export const ENDPOINT_BY_ID = Object.fromEntries(ENDPOINTS.map((e) => [e.id, e]));

export function endpointsFor(categoryId) {
  return ENDPOINTS.filter((e) => e.category === categoryId);
}

export function resolvePath(ep, params) {
  return typeof ep.path === "function" ? ep.path(params) : ep.path;
}
