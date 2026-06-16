import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";

export default function SettingsTab() {
  const { settings, patchSettings, notify } = useStore();
  const [local, setLocal] = useState(settings);
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setLocal((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    setBusy(true);
    try {
      await patchSettings(local);
      notify("설정을 저장했습니다.", "success");
    } catch (e) {
      notify("저장 실패: " + e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearLogs() {
    if (!window.confirm("모든 호출 로그를 삭제할까요?")) return;
    await api.clearLogs();
    notify("호출 로그를 비웠습니다.", "success");
  }

  const num = "w-40 border border-slate-300 rounded px-2 py-1 text-sm font-mono";

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="font-bold text-lg text-slate-800">설정 / 안전장치</h2>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!local.read_only} onChange={(e) => set("read_only", e.target.checked)} />
          <span className="text-sm font-semibold">읽기 전용 모드 (GET 외 모든 호출 차단)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!local.dry_run} onChange={(e) => set("dry_run", e.target.checked)} />
          <span className="text-sm font-semibold">Dry-run (서명된 요청만 화면 표시, 전송 안 함)</span>
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-slate-700 text-sm">금액 상한 (0 = 제한 없음, 초과 시 차단)</h3>
        <div className="space-y-2">
          <Row label="주문 KRW 총액 상한" v={local.limit_order_krw} on={(x) => set("limit_order_krw", x)} cls={num} />
          <Row label="원화 출금 상한(KRW)" v={local.limit_withdraw_krw} on={(x) => set("limit_withdraw_krw", x)} cls={num} />
          <Row label="코인 출금 수량 상한" v={local.limit_withdraw_coin} on={(x) => set("limit_withdraw_coin", x)} cls={num} />
          <Row label="자산 이전 수량 상한" v={local.limit_transfer} on={(x) => set("limit_transfer", x)} cls={num} />
        </div>
      </section>

      <button onClick={save} disabled={busy} className="px-4 py-1.5 rounded bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50">
        설정 저장
      </button>

      <section className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-500 space-y-2">
        <p>· 레이트리밋: Exchange 기본 그룹은 계정 단위로 초당 약 30회를 공유합니다. 각 호출의 <span className="font-mono">Remaining-Req</span> 헤더가 응답 영역에 표시됩니다.</p>
        <p>· 안전장치는 백엔드에서도 강제됩니다(프론트 우회 불가).</p>
        <button onClick={clearLogs} className="mt-1 px-3 py-1 border border-rose-300 text-rose-600 rounded">호출 로그 전체 삭제</button>
      </section>
    </div>
  );
}

function Row({ label, v, on, cls }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <input className={cls} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
