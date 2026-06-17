// Shared field utilities for EndpointRunner and FieldInput.
// Do not import other project files here.

export function genIdentifier() {
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

export function parseTimeMs(v) {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function pocketOptions(pockets) {
  return (pockets || []).map((pk) => ({
    value: pk.uuid,
    label: `${pk.name ?? "(이름없음)"} · ${pk.pocket_type ?? "?"} · ${String(pk.uuid || "").slice(0, 8)}…`,
  }));
}
