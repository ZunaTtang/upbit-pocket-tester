import { create } from "zustand";
import { api } from "./api";
import {
  mergeMarketOptions,
  marketOptionsFromAll,
  currenciesFromAll,
  POPULAR_MARKETS,
  POPULAR_CURRENCIES,
} from "./catalogs";

// Global app state: which key is active, the safety toggles/limits, and the
// cached pocket list used to populate from/to/uuid dropdowns.
export const useStore = create((set, get) => ({
  keys: [],
  activeKey: null,
  settings: {
    read_only: false,
    dry_run: false,
    limit_order_krw: "1000000",
    limit_withdraw_krw: "100000",
    limit_withdraw_coin: "0",
    limit_transfer: "0",
  },
  pockets: [], // [{uuid, name, pocket_type, ...}]
  pocketsLoadedAt: null,
  marketCatalog: { markets: [], currencies: [], loadedAt: null, loading: false },
  baseUrl: "",
  presets: [],
  toast: null,

  notify(msg, kind = "info") {
    set({ toast: { msg, kind, at: Date.now() } });
    setTimeout(() => {
      if (get().toast && Date.now() - get().toast.at >= 3500) set({ toast: null });
    }, 3600);
  },

  async loadAll() {
    const [keys, settings, meta, presets] = await Promise.all([
      api.listKeys(),
      api.getSettings(),
      api.meta().catch(() => ({ base_url: "" })),
      api.listPresets().catch(() => []),
    ]);
    const activeKey = keys.find((k) => k.is_active) || null;
    set({ keys, settings, activeKey, baseUrl: meta.base_url, presets });
  },

  async loadPresets() {
    set({ presets: await api.listPresets() });
  },
  async savePreset(p) {
    await api.createPreset(p);
    await get().loadPresets();
  },
  async updatePreset(id, p) {
    await api.updatePreset(id, p);
    await get().loadPresets();
  },
  async deletePreset(id) {
    await api.deletePreset(id);
    await get().loadPresets();
  },

  async refreshKeys() {
    const keys = await api.listKeys();
    set({ keys, activeKey: keys.find((k) => k.is_active) || null });
  },

  async setActive(id) {
    await api.activateKey(id);
    await get().refreshKeys();
    set({ pockets: [], pocketsLoadedAt: null }); // pocket list is per-key
  },

  async patchSettings(patch) {
    const settings = await api.updateSettings(patch);
    set({ settings });
  },

  // Fetch GET /v1/pockets through the proxy and cache main/sub uuids + names.
  async loadPockets(force = false) {
    const { pockets, pocketsLoadedAt, activeKey } = get();
    if (!force && pockets.length && pocketsLoadedAt) return pockets;
    if (!activeKey) return [];
    const res = await api.proxy({
      key_id: activeKey.id,
      method: "GET",
      path: "/v1/pockets",
      params: {},
      authenticated: true,
      endpoint_id: "pockets.list",
      label: "포켓 목록(드롭다운 캐시)",
    });
    const body = res.response && res.response.body;
    let list = [];
    if (Array.isArray(body)) list = body;
    else if (body && Array.isArray(body.pockets)) list = body.pockets;
    set({ pockets: list, pocketsLoadedAt: Date.now() });
    return list;
  },

  // Fetch GET /v1/market/all (public, no auth) once and cache the market/
  // currency option lists used by the search pickers. Always sets
  // marketCatalog with a fresh loadedAt; falls back to the popular presets
  // when the request fails or returns an unexpected shape.
  async loadMarketCatalog(force = false) {
    const { marketCatalog } = get();
    if (marketCatalog.loadedAt && !force) return;
    set({ marketCatalog: { ...marketCatalog, loading: true } });
    let markets = POPULAR_MARKETS;
    let currencies = POPULAR_CURRENCIES;
    try {
      const res = await api.proxy({
        key_id: null,
        method: "GET",
        path: "/v1/market/all",
        params: { is_details: "false" },
        authenticated: false,
        endpoint_id: "quotation.market_all",
        label: "마켓 카탈로그",
      });
      const body = res.response && res.response.body;
      if (Array.isArray(body)) {
        markets = mergeMarketOptions(POPULAR_MARKETS, marketOptionsFromAll(body));
        currencies = currenciesFromAll(body);
      }
    } catch {
      // keep the popular-preset fallback assigned above
    }
    set({
      marketCatalog: { markets, currencies, loadedAt: Date.now(), loading: false },
    });
  },
}));
