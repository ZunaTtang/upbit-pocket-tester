import { useStore } from "../store";

// Active-key selector + quick safety toggles, pinned under the banner.
export default function KeyBar() {
  const { keys, activeKey, settings, setActive, patchSettings, baseUrl } = useStore();

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold text-slate-600">활성 키</span>
      <select
        value={activeKey ? activeKey.id : ""}
        onChange={(e) => e.target.value && setActive(Number(e.target.value))}
        className="border border-slate-300 rounded px-2 py-1 min-w-[14rem]"
      >
        <option value="" disabled>
          {keys.length ? "키 선택…" : "등록된 키 없음 — '키 관리' 탭에서 추가"}
        </option>
        {keys.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label} · {k.pocket_type === "main" ? "메인" : "서브"}포켓
          </option>
        ))}
      </select>

      {activeKey && (
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            activeKey.pocket_type === "main"
              ? "bg-sky-100 text-sky-800"
              : "bg-violet-100 text-violet-800"
          }`}
        >
          {activeKey.pocket_type === "main" ? "메인포켓" : "서브포켓"} 키
        </span>
      )}

      <label className="flex items-center gap-1 ml-auto cursor-pointer">
        <input
          type="checkbox"
          checked={!!settings.read_only}
          onChange={(e) => patchSettings({ read_only: e.target.checked })}
        />
        <span>읽기 전용 모드</span>
      </label>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={!!settings.dry_run}
          onChange={(e) => patchSettings({ dry_run: e.target.checked })}
        />
        <span>Dry-run</span>
      </label>
      <span className="text-xs text-slate-400 font-mono">{baseUrl}</span>
    </div>
  );
}
