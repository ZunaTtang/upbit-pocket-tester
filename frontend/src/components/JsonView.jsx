import { useState } from "react";

export function CopyButton({ value, label = "복사" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            typeof value === "string" ? value : JSON.stringify(value, null, 2)
          );
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard may be blocked on file:// — ignore */
        }
      }}
      className="text-xs px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
    >
      {done ? "✓ 복사됨" : label}
    </button>
  );
}

// Collapsible JSON viewer with a copy button.
export default function JsonView({ title, data, defaultOpen = true, maxHeight = "20rem" }) {
  const [open, setOpen] = useState(defaultOpen);
  const text =
    data === null || data === undefined
      ? "(없음)"
      : typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2);
  return (
    <div className="border border-slate-200 rounded bg-slate-50">
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-slate-600"
        >
          {open ? "▾" : "▸"} {title}
        </button>
        <CopyButton value={text} />
      </div>
      {open && (
        <pre className="json-block p-2 overflow-auto" style={{ maxHeight }}>
          {text}
        </pre>
      )}
    </div>
  );
}
