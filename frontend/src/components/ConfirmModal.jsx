import JsonView from "./JsonView";

// Final confirmation for any write action — re-shows the exact request body.
export default function ConfirmModal({ open, title, method, url, body, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-4">
        <h3 className="text-base font-bold text-rose-700">⚠ 실거래 확인 — {title}</h3>
        <p className="text-sm text-slate-600 mt-1">
          업비트는 샌드박스가 없습니다. 아래 요청이 <b>실제로 전송</b>됩니다. 내용을 다시 확인하세요.
        </p>
        <div className="mt-2 text-xs font-mono bg-slate-100 rounded p-2 break-all">
          {method} {url}
        </div>
        <div className="mt-2">
          <JsonView title="전송될 요청 바디/파라미터" data={body} maxHeight="14rem" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
          >
            실행 (전송)
          </button>
        </div>
      </div>
    </div>
  );
}
