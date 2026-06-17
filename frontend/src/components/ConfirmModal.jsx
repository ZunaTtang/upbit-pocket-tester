import { useEffect, useState } from "react";
import JsonView from "./JsonView";

// Final confirmation for any write action — re-shows the exact request body.
// Optional `highRisk` adds a stronger visual treatment plus a "내용을 확인했습니다"
// checkbox gate; optional `guard` ({ label, amount, cap }) shows a cap notice.
export default function ConfirmModal({ open, title, method, url, body, onConfirm, onCancel, highRisk = false, guard = null }) {
  const [acked, setAcked] = useState(false);

  // Reset the acknowledgement gate every time the modal opens.
  useEffect(() => {
    if (open) setAcked(false);
  }, [open]);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmDisabled = highRisk && !acked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-card shadow-pop w-full max-w-xl overflow-hidden ${highRisk ? "ring-2 ring-danger-500" : ""}`}>
        <div className="h-1 bg-danger-600" />
        <div className="p-5">
          <h3 className="text-base font-bold text-danger-700">⚠ 실거래 확인 — {title}</h3>
          <p className="text-sm text-ink-700 mt-1 leading-relaxed">
            업비트는 샌드박스가 없습니다. 아래 요청이 <b>실제로 전송</b>됩니다. 내용을 다시 확인하세요.
          </p>
          <div className="mt-3 field-mono text-xs bg-ink-100 rounded-control p-2.5 break-words">
            {method} {url}
          </div>
          {guard && (
            <div className="mt-2 callout-warn text-xs">
              {guard.label}: <b>{guard.amount}</b>
              {guard.cap != null && guard.cap !== "" && Number(guard.cap) > 0 && (
                <> / 상한 <b>{guard.cap}</b></>
              )}
            </div>
          )}
          <div className="mt-3">
            <JsonView title="전송될 요청 바디/파라미터" data={body} maxHeight="14rem" />
          </div>
          {highRisk && (
            <label className="mt-3 flex items-start gap-2 text-sm text-danger-700">
              <input type="checkbox" className="mt-0.5" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
              <span>위 요청 내용을 확인했으며, 실거래로 전송함에 동의합니다.</span>
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} autoFocus className="btn-ghost">
              취소
            </button>
            <button onClick={onConfirm} disabled={confirmDisabled} className="btn-danger">
              실행 (전송)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
