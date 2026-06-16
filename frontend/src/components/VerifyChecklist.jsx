import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

// Human verification checklist stored alongside the originating call log.
export default function VerifyChecklist({ logId, items, initial }) {
  const notify = useStore((s) => s.notify);
  const [state, setState] = useState(() => {
    const base = {};
    items.forEach((it) => (base[it.key] = false));
    return { ...base, ...(initial && initial.checklist) };
  });
  const [note, setNote] = useState((initial && initial.note) || "");
  const [saving, setSaving] = useState(false);

  const allChecked = items.every((it) => state[it.key]);

  async function save() {
    if (!logId) return;
    setSaving(true);
    try {
      await api.saveVerify(logId, { checklist: state, note });
      notify("검증 체크리스트를 호출 로그에 저장했습니다.", "success");
    } catch (e) {
      notify("저장 실패: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 border border-emerald-200 bg-emerald-50/60 rounded p-3">
      <div className="text-sm font-semibold text-emerald-800 mb-2">
        ✅ 검증 체크리스트 {allChecked && <span className="text-emerald-600">(모두 확인됨)</span>}
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <label key={it.key} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!!state[it.key]}
              onChange={(e) => setState((s) => ({ ...s, [it.key]: e.target.checked }))}
            />
            <span>{it.label}</span>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모(선택) — 대조 결과, 특이사항 등"
        className="mt-2 w-full text-sm border border-slate-300 rounded p-1.5 h-16"
      />
      <button
        onClick={save}
        disabled={saving || !logId}
        className="mt-2 px-3 py-1 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : "체크리스트 저장(로그에 기록)"}
      </button>
    </div>
  );
}
