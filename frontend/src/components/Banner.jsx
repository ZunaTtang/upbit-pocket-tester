import { useStore } from "../store";

// Always-on warning that this hits real Upbit, plus live safety-toggle state.
export default function Banner() {
  const settings = useStore((s) => s.settings);
  return (
    <div className="bg-danger-600 text-white px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <span className="font-bold text-sm">⚠ 실거래 경고</span>
      <span className="opacity-95">
        업비트는 샌드박스가 없습니다. 모든 호출은 실제 계정·실제 자산에 반영됩니다.
      </span>
      <span className="ml-auto flex items-center gap-2">
        {settings.read_only && (
          <span className="badge bg-white/25 text-white">읽기 전용 ON</span>
        )}
        {settings.dry_run && (
          <span className="badge bg-white/25 text-white">DRY-RUN ON</span>
        )}
      </span>
    </div>
  );
}
