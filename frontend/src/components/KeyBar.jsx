import { useStore } from "../store";
import { PERMISSION_LABEL } from "../endpoints";

// Active-key selector + permission summary + quick safety toggles, pinned under
// the banner.
export default function KeyBar() {
  const { keys, activeKey, settings, setActive, patchSettings, baseUrl } = useStore();

  const perms = activeKey?.permissions ?? [];
  const topPerms = perms.slice(0, 4);
  const overflow = perms.length - topPerms.length;

  function SafetyPill({ on, onColor, label }) {
    return (
      <span
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-control text-xs font-semibold border ${
          on ? onColor : "bg-ink-100 text-ink-500 border-ink-200"
        }`}
      >
        {label}
        <span>{on ? "ON" : "OFF"}</span>
      </span>
    );
  }

  return (
    <div className="bg-white border-b border-ink-200 px-4 py-2 flex flex-wrap items-center gap-3">
      <span className="field-label mb-0 shrink-0">활성 키</span>
      <select
        value={activeKey ? activeKey.id : ""}
        onChange={(e) => e.target.value && setActive(Number(e.target.value))}
        className="field-input w-full sm:w-auto sm:min-w-[15rem]"
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
          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
            activeKey.pocket_type === "main"
              ? "bg-brand-100 text-brand-700"
              : "bg-accent-violet-100 text-accent-violet-700"
          }`}
        >
          {activeKey.pocket_type === "main" ? "메인포켓" : "서브포켓"} 키
        </span>
      )}

      {activeKey && perms.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {topPerms.map((p) => (
            <span key={p} className="chip">
              {PERMISSION_LABEL[p] || p}
            </span>
          ))}
          {overflow > 0 && <span className="chip">+{overflow}</span>}
        </span>
      )}

      {!keys.length && (
        <button
          className="btn-ghost btn-sm"
          onClick={() => window.dispatchEvent(new CustomEvent("wb:navtab", { detail: "keys" }))}
        >
          키 관리
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => patchSettings({ read_only: !settings.read_only })}
          title="읽기 전용 모드: 쓰기 호출을 차단합니다."
        >
          <SafetyPill
            on={!!settings.read_only}
            onColor="bg-warn-100 text-warn-800 border-warn-200"
            label="읽기 전용"
          />
        </button>
        <button
          type="button"
          onClick={() => patchSettings({ dry_run: !settings.dry_run })}
          title="Dry-run: 실제 전송 없이 요청을 시뮬레이션합니다."
        >
          <SafetyPill
            on={!!settings.dry_run}
            onColor="bg-accent-indigo-100 text-accent-indigo-700 border-accent-indigo-200"
            label="Dry-run"
          />
        </button>
      </div>

      <span className="w-full text-xs text-ink-400 font-mono sm:w-auto sm:basis-full">{baseUrl}</span>
    </div>
  );
}
