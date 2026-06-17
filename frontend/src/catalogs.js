// ===========================================================================
// Static catalogs + pure helpers for market / currency pickers.
//
// This module is intentionally dependency-free: no network, no store, no React.
// It exposes a curated set of "popular" markets and currencies (so the pickers
// are useful before any /v1/market/all call returns) plus pure functions that
// normalize a live `market/all` response body into the same option shape and
// merge it with the curated list.
//
// Option shapes:
//   market option   -> { value, label, base, quote, secondary }
//   currency option -> { value, label, name?, netTypes? }
//
// `value` is the canonical code (market code e.g. "KRW-BTC", currency e.g.
// "BTC"). `label` is human-friendly: "<한글명> (<코드>)". None of these
// functions throw — bad input yields an empty array.
// ===========================================================================

// ---------------------------------------------------------------------------
// Curated popular markets. label = "<한글명> (<마켓코드>)".
// ---------------------------------------------------------------------------
export const POPULAR_MARKETS = [
  // --- KRW 마켓 (원화) ---
  { value: "KRW-BTC", label: "비트코인 (KRW-BTC)", base: "BTC", quote: "KRW", secondary: "비트코인" },
  { value: "KRW-ETH", label: "이더리움 (KRW-ETH)", base: "ETH", quote: "KRW", secondary: "이더리움" },
  { value: "KRW-XRP", label: "리플 (KRW-XRP)", base: "XRP", quote: "KRW", secondary: "리플" },
  { value: "KRW-SOL", label: "솔라나 (KRW-SOL)", base: "SOL", quote: "KRW", secondary: "솔라나" },
  { value: "KRW-DOGE", label: "도지코인 (KRW-DOGE)", base: "DOGE", quote: "KRW", secondary: "도지코인" },
  { value: "KRW-ADA", label: "에이다 (KRW-ADA)", base: "ADA", quote: "KRW", secondary: "에이다" },
  { value: "KRW-TRX", label: "트론 (KRW-TRX)", base: "TRX", quote: "KRW", secondary: "트론" },
  { value: "KRW-AVAX", label: "아발란체 (KRW-AVAX)", base: "AVAX", quote: "KRW", secondary: "아발란체" },
  { value: "KRW-LINK", label: "체인링크 (KRW-LINK)", base: "LINK", quote: "KRW", secondary: "체인링크" },
  { value: "KRW-DOT", label: "폴카닷 (KRW-DOT)", base: "DOT", quote: "KRW", secondary: "폴카닷" },
  { value: "KRW-MATIC", label: "폴리곤 (KRW-MATIC)", base: "MATIC", quote: "KRW", secondary: "폴리곤" },
  { value: "KRW-SUI", label: "수이 (KRW-SUI)", base: "SUI", quote: "KRW", secondary: "수이" },
  { value: "KRW-USDT", label: "테더 (KRW-USDT)", base: "USDT", quote: "KRW", secondary: "테더" },
  { value: "KRW-ETC", label: "이더리움클래식 (KRW-ETC)", base: "ETC", quote: "KRW", secondary: "이더리움클래식" },
  { value: "KRW-BCH", label: "비트코인캐시 (KRW-BCH)", base: "BCH", quote: "KRW", secondary: "비트코인캐시" },

  // --- BTC 마켓 ---
  { value: "BTC-ETH", label: "이더리움 (BTC-ETH)", base: "ETH", quote: "BTC", secondary: "이더리움" },
  { value: "BTC-XRP", label: "리플 (BTC-XRP)", base: "XRP", quote: "BTC", secondary: "리플" },

  // --- USDT 마켓 ---
  { value: "USDT-BTC", label: "비트코인 (USDT-BTC)", base: "BTC", quote: "USDT", secondary: "비트코인" },
  { value: "USDT-ETH", label: "이더리움 (USDT-ETH)", base: "ETH", quote: "USDT", secondary: "이더리움" },
];

// ---------------------------------------------------------------------------
// Curated popular currencies. label = "<한글명> (<코드>)".
// `netTypes` lists the network codes Upbit uses for that currency (empty for
// KRW which has no on-chain network). Used to hint the net_type field.
// ---------------------------------------------------------------------------
export const POPULAR_CURRENCIES = [
  { value: "KRW", label: "원화 (KRW)", name: "원화", netTypes: [] },
  { value: "BTC", label: "비트코인 (BTC)", name: "비트코인", netTypes: ["BTC"] },
  { value: "ETH", label: "이더리움 (ETH)", name: "이더리움", netTypes: ["ETH"] },
  { value: "USDT", label: "테더 (USDT)", name: "테더", netTypes: ["ETH", "TRX", "SOL", "MATIC", "BNB"] },
  { value: "XRP", label: "리플 (XRP)", name: "리플", netTypes: ["XRP"] },
  { value: "SOL", label: "솔라나 (SOL)", name: "솔라나", netTypes: ["SOL"] },
  { value: "TRX", label: "트론 (TRX)", name: "트론", netTypes: ["TRX"] },
  { value: "DOGE", label: "도지코인 (DOGE)", name: "도지코인", netTypes: ["DOGE"] },
  { value: "ADA", label: "에이다 (ADA)", name: "에이다", netTypes: ["ADA"] },
  { value: "AVAX", label: "아발란체 (AVAX)", name: "아발란체", netTypes: ["AVAX", "CCHAIN"] },
  { value: "LINK", label: "체인링크 (LINK)", name: "체인링크", netTypes: ["ETH"] },
  { value: "DOT", label: "폴카닷 (DOT)", name: "폴카닷", netTypes: ["DOT"] },
  { value: "MATIC", label: "폴리곤 (MATIC)", name: "폴리곤", netTypes: ["MATIC", "ETH"] },
  { value: "SUI", label: "수이 (SUI)", name: "수이", netTypes: ["SUI"] },
  { value: "ETC", label: "이더리움클래식 (ETC)", name: "이더리움클래식", netTypes: ["ETC"] },
  { value: "BCH", label: "비트코인캐시 (BCH)", name: "비트코인캐시", netTypes: ["BCH"] },
];

// Fast lookup: currency code -> curated currency descriptor.
const CURRENCY_BY_VALUE = Object.fromEntries(
  POPULAR_CURRENCIES.map((c) => [c.value, c])
);

// ---------------------------------------------------------------------------
// helpers (internal)
// ---------------------------------------------------------------------------

// Split a market code "QUOTE-BASE" into { quote, base }. Tolerant of garbage.
function splitMarket(market) {
  const code = typeof market === "string" ? market : "";
  const dash = code.indexOf("-");
  if (dash < 0) return { quote: "", base: code };
  return { quote: code.slice(0, dash), base: code.slice(dash + 1) };
}

// Korean (or fallback) display name for a currency code, if we know it.
function currencyName(code) {
  const c = CURRENCY_BY_VALUE[code];
  return c ? c.name : undefined;
}

// ---------------------------------------------------------------------------
// marketOptionsFromAll(allBody)
// Normalize a /v1/market/all response array into market options. Each item:
//   { market, korean_name?, english_name?, ... }
// -> { value, label, base, quote, secondary }
// label uses korean_name -> english_name -> base, then " (<market>)".
// Non-array input returns []. Never throws.
// ---------------------------------------------------------------------------
export function marketOptionsFromAll(allBody) {
  if (!Array.isArray(allBody)) return [];
  const out = [];
  for (const item of allBody) {
    if (!item || typeof item !== "object") continue;
    const market = typeof item.market === "string" ? item.market : "";
    if (!market) continue;
    const { base, quote } = splitMarket(market);
    const korean = typeof item.korean_name === "string" ? item.korean_name : "";
    const english = typeof item.english_name === "string" ? item.english_name : "";
    const display = korean || english || base;
    out.push({
      value: market,
      label: `${display} (${market})`,
      base,
      quote,
      secondary: korean,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// currenciesFromAll(allBody)
// Collect the unique set of base + quote currencies appearing across every
// market in a /v1/market/all body. Returns [{ value, label, name? }].
// Korean names come from POPULAR_CURRENCIES when available. Never throws.
// ---------------------------------------------------------------------------
export function currenciesFromAll(allBody) {
  if (!Array.isArray(allBody)) return [];
  const seen = new Set();
  const out = [];
  const add = (code) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    const name = currencyName(code);
    out.push({
      value: code,
      label: name ? `${name} (${code})` : code,
      ...(name ? { name } : {}),
    });
  };
  for (const item of allBody) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.market !== "string") continue;
    const { base, quote } = splitMarket(item.market);
    add(quote);
    add(base);
  }
  return out;
}

// ---------------------------------------------------------------------------
// mergeMarketOptions(popular, all)
// Popular options first (preserving order), then any option from `all` whose
// value is not already present. De-duplicates by value. Never throws.
// ---------------------------------------------------------------------------
export function mergeMarketOptions(popular, all) {
  const pop = Array.isArray(popular) ? popular : [];
  const extra = Array.isArray(all) ? all : [];
  const seen = new Set(pop.map((o) => o && o.value));
  const out = [...pop];
  for (const o of extra) {
    if (!o || seen.has(o.value)) continue;
    seen.add(o.value);
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// netTypeHintFor(currency)
// Return the curated netTypes array for a currency code, or [] if unknown.
// ---------------------------------------------------------------------------
export function netTypeHintFor(currency) {
  const c = CURRENCY_BY_VALUE[currency];
  return c && Array.isArray(c.netTypes) ? c.netTypes : [];
}
