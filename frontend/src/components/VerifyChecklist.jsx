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
    <div className="mt-2 rounded-control border border-ok-600/30 bg-ok-50/60 p-3">
      <div className="text-sm font-semibold text-ok-800 mb-2">
        ✅ 검증 체크리스트 {allChecked && <span className="text-ok-600">(모두 확인됨)</span>}
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <label key={it.key} className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
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
        className="mt-2 field-input h-16 resize-y"
      />
      <button
        onClick={save}
        disabled={saving || !logId}
        className="mt-2 btn btn-sm bg-ok-600 text-white hover:bg-ok-700 disabled:opacity-50"
      >
        {saving ? "저장 중…" : "체크리스트 저장(로그에 기록)"}
      </button>
    </div>
  );
}
