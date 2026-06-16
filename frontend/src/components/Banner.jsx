import { useStore } from "../store";

// Always-on warning that this hits real Upbit, plus live safety-toggle state.
export default function Banner() {
  const settings = useStore((s) => s.settings);
  return (
    <div className="bg-rose-600 text-white text-sm px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="font-bold">⚠ 실거래 경고</span>
      <span className="opacity-90">
        업비트는 샌드박스가 없습니다. 모든 호출은 실제 계정·실제 자산에 반영됩니다.
      </span>
      <span className="ml-auto flex items-center gap-2">
        {settings.read_only && (
          <span className="px-2 py-0.5 rounded bg-white/20 font-semibold">읽기 전용 ON</span>
        )}
        {settings.dry_run && (
          <span className="px-2 py-0.5 rounded bg-white/20 font-semibold">DRY-RUN ON</span>
        )}
      </span>
    </div>
  );
}
