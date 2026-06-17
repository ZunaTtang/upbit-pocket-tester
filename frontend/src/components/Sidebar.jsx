import { useStore } from "../store";
import { CATEGORIES } from "../endpoints";

// Per-category glyphs, keyed by category id.
const CAT_ICON = {
  quotation: "📈",
  accounts: "💰",
  orders: "🧾",
  deposits: "📥",
  withdraws: "📤",
  pockets: "🗂",
};

// Left tab nav. Tabs are disabled (with a reason tooltip + inline note) when the
// active key's pocket type can't use them.
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

  const publicCats = CATEGORIES.filter((c) => !c.auth);
  const authCats = CATEGORIES.filter((c) => c.auth);

  function NavButton({ item, icon }) {
    const { disabled, reason } = gate(item);
    const active = tab === item.id;
    return (
      <button
        disabled={disabled}
        title={disabled ? reason : undefined}
        onClick={() => !disabled && setTab(item.id)}
        className={`relative w-full text-left pl-4 pr-3 py-2 text-sm flex items-center gap-2 transition ${
          active
            ? "bg-ink-800 text-white font-semibold"
            : disabled
            ? "text-ink-600 cursor-not-allowed"
            : "hover:bg-ink-800/60"
        }`}
      >
        {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500" />}
        <span className="shrink-0">{icon ?? item.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate">{item.label}</span>
          {disabled && reason && (
            <span className="block text-[10px] text-ink-500 leading-tight truncate">{reason}</span>
          )}
        </span>
      </button>
    );
  }

  function GroupHeader({ children }) {
    return (
      <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
        {children}
      </div>
    );
  }

  return (
    <nav className="w-60 shrink-0 bg-ink-900 text-ink-200 py-2 overflow-y-auto">
      <div className="px-4 py-3 text-xs font-bold text-ink-300 border-b border-ink-800">
        Upbit Pocket Tester
      </div>

      <NavButton item={{ id: "keys", label: "키 관리" }} icon="🔑" />

      <GroupHeader>인증 불필요</GroupHeader>
      {publicCats.map((c) => (
        <NavButton key={c.id} item={c} icon={CAT_ICON[c.id]} />
      ))}

      <GroupHeader>인증 필요</GroupHeader>
      {authCats.map((c) => (
        <NavButton key={c.id} item={c} icon={CAT_ICON[c.id]} />
      ))}

      <div className="mt-2 border-t border-ink-800 pt-1">
        <NavButton item={{ id: "history", label: "히스토리" }} icon="🕑" />
        <NavButton item={{ id: "settings", label: "설정/안전장치" }} icon="⚙" />
        <NavButton item={{ id: "help", label: "도움말 · 포켓 권한" }} icon="❓" />
      </div>
    </nav>
  );
}
