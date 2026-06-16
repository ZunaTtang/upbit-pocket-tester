// Thin wrapper around the local backend. The browser never sees secret_keys;
// it only sends key_id and lets the backend sign.

async function req(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  if (!res.ok) {
    const msg = data && data.detail ? data.detail : `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  // meta / settings
  health: () => req("GET", "/api/health"),
  meta: () => req("GET", "/api/meta"),
  getSettings: () => req("GET", "/api/settings"),
  updateSettings: (patch) => req("PUT", "/api/settings", patch),

  // keys
  listKeys: () => req("GET", "/api/keys"),
  activeKey: () => req("GET", "/api/keys/active"),
  createKey: (k) => req("POST", "/api/keys", k),
  updateKey: (id, k) => req("PUT", `/api/keys/${id}`, k),
  deleteKey: (id) => req("DELETE", `/api/keys/${id}`),
  activateKey: (id) => req("POST", `/api/keys/${id}/activate`),

  // presets
  listPresets: () => req("GET", "/api/presets"),
  createPreset: (p) => req("POST", "/api/presets", p),
  updatePreset: (id, p) => req("PUT", `/api/presets/${id}`, p),
  deletePreset: (id) => req("DELETE", `/api/presets/${id}`),

  // logs
  listLogs: (q = "", limit = 200) =>
    req("GET", `/api/logs?q=${encodeURIComponent(q)}&limit=${limit}`),
  getLog: (id) => req("GET", `/api/logs/${id}`),
  saveVerify: (id, payload) => req("POST", `/api/logs/${id}/verify`, payload),
  clearLogs: () => req("DELETE", "/api/logs"),
  newIdentifier: (prefix = "wb") =>
    req("GET", `/api/identifier?prefix=${encodeURIComponent(prefix)}`),

  // the signed proxy
  proxy: (payload) => req("POST", "/api/proxy", payload),
};
