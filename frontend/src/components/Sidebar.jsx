import { useStore } from "../store";
import { CATEGORIES } from "../endpoints";

// Left tab nav. Tabs are disabled (with a reason tooltip) when the active key's
// pocket type can't use them.
export default function Sidebar({ tab, setTab }) {
  const activeKey = useStore((s) => s.activeKey);

  function gate(catOrTab) {
    if (!catOrTab.pocketType) return { disabled: false };
    if (!activeKey) return { disabled: true, reason: "활성 키가 없습니다." };
    if (activeKey.pocket_type !== catOrTab.pocketType)
      return {
        disabled: true,
        reason: `${catOrTab.pocketType === "main" ? "메인" : "서브"}포켓 키 전용 탭입니다. (현재: ${
          activeKey.pocket_type === "main" ? "메인" : "서브"
        }포켓)`,
      };
    return { disabled: false };
  }

  const items = [
    { id: "keys", label: "🔑 키 관리" },
    ...CATEGORIES,
    { id: "history", label: "🕑 히스토리" },
    { id: "settings", label: "⚙ 설정/안전장치" },
  ];

  return (
    <nav className="w-56 shrink-0 bg-slate-800 text-slate-200 p-2 space-y-1 overflow-y-auto">
      <div className="px-2 py-2 text-xs uppercase tracking-wide text-slate-400">
        Upbit Pocket Tester
      </div>
      {items.map((it) => {
        const { disabled, reason } = gate(it);
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            disabled={disabled}
            title={disabled ? reason : undefined}
            onClick={() => !disabled && setTab(it.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition ${
              active
                ? "bg-sky-600 text-white font-semibold"
                : disabled
                ? "text-slate-500 cursor-not-allowed"
                : "hover:bg-slate-700"
            }`}
          >
            {it.label}
            {disabled && <span className="block text-[10px] text-slate-500">비활성 · 사유 ℹ</span>}
          </button>
        );
      })}
    </nav>
  );
}
