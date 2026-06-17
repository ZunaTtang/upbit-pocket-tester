import { useState } from "react";

export function CopyButton({ value, label = "복사" }) {
  const [state, setState] = useState("idle"); // idle | done | fail
  return (
    <button
      type="button"
      onClick={async () => {
        const text =
          typeof value === "string" ? value : JSON.stringify(value, null, 2);
        const flash = (s) => {
          setState(s);
          setTimeout(() => setState("idle"), 1200);
        };
        try {
          await navigator.clipboard.writeText(text);
          flash("done");
        } catch {
          // clipboard may be blocked on file:// — try legacy fallback.
          try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            flash(ok ? "done" : "fail");
          } catch {
            flash("fail");
          }
        }
      }}
      className="btn-ghost btn-sm"
    >
      {state === "done" ? "✓ 복사됨" : state === "fail" ? "복사 실패" : label}
    </button>
  );
}

// Collapsible JSON viewer with a copy button.
export default function JsonView({ title, data, defaultOpen = true, maxHeight = "24rem" }) {
  const [open, setOpen] = useState(defaultOpen);
  const text =
    data === null || data === undefined
      ? "(없음)"
      : typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2);
  return (
    <div className="border border-ink-200 rounded-control bg-ink-50">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-ink-200">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-ink-700"
        >
          {open ? "▾" : "▸"} {title}
        </button>
        <CopyButton value={text} />
      </div>
      {open && (
        <pre className="json-block p-3 overflow-auto" style={{ maxHeight }}>
          {text}
        </pre>
      )}
    </div>
  );
}
