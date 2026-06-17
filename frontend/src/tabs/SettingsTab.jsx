import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";

export default function SettingsTab() {
  const { settings, patchSettings, notify } = useStore();
  const [local, setLocal] = useState(settings);
  const [busy, setBusy] = useState(false);

  // Resync local draft whenever the canonical settings change (e.g. reload).
  useEffect(() => {
    setLocal(settings);
  }, [settings]);

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

  const roCls = local.read_only
    ? "flex items-center gap-2 rounded-control bg-warn-50 border border-warn-200 px-3 py-2"
    : "flex items-center gap-2";
  const drCls = local.dry_run
    ? "flex items-center gap-2 rounded-control bg-accent-indigo-50 border border-accent-indigo-200 px-3 py-2"
    : "flex items-center gap-2";

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="section-title text-lg">설정 / 안전장치</h2>

      <section className="card p-4 space-y-3">
        <label className={roCls}>
          <input type="checkbox" checked={!!local.read_only} onChange={(e) => set("read_only", e.target.checked)} />
          <span className="text-sm font-semibold text-ink-800">읽기 전용 모드 (GET 외 모든 호출 차단)</span>
        </label>
        <label className={drCls}>
          <input type="checkbox" checked={!!local.dry_run} onChange={(e) => set("dry_run", e.target.checked)} />
          <span className="text-sm font-semibold text-ink-800">Dry-run (서명된 요청만 화면 표시, 전송 안 함)</span>
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <h3 className="section-title text-sm">금액 상한 (0 = 제한 없음, 초과 시 차단)</h3>
        <div className="space-y-2">
          <Row label="주문 KRW 총액 상한" v={local.limit_order_krw} on={(x) => set("limit_order_krw", x)} />
          <Row label="원화 출금 상한(KRW)" v={local.limit_withdraw_krw} on={(x) => set("limit_withdraw_krw", x)} />
          <Row label="코인 출금 수량 상한" v={local.limit_withdraw_coin} on={(x) => set("limit_withdraw_coin", x)} />
          <Row label="자산 이전 수량 상한" v={local.limit_transfer} on={(x) => set("limit_transfer", x)} />
        </div>
      </section>

      <button onClick={save} disabled={busy} className="btn-primary">
        설정 저장
      </button>

      <section className="card p-4 text-xs text-ink-500 space-y-2">
        <p>· 레이트리밋: Exchange 기본 그룹은 계정 단위로 초당 약 30회를 공유합니다. 각 호출의 <span className="field-mono">Remaining-Req</span> 헤더가 응답 영역에 표시됩니다.</p>
        <p>· 안전장치는 백엔드에서도 강제됩니다(프론트 우회 불가).</p>
        <button onClick={clearLogs} className="btn-ghost btn-sm border-danger-300 text-danger-600 hover:bg-danger-50 mt-1">호출 로그 전체 삭제</button>
      </section>
    </div>
  );
}

function Row({ label, v, on }) {
  const noLimit = Number(v) === 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-700">{label}</span>
      <div className="flex items-center gap-2">
        {noLimit && <span className="chip bg-warn-100 text-warn-800">제한 없음(주의)</span>}
        <input className="field-input field-mono w-44 text-right" value={v} onChange={(e) => on(e.target.value)} />
      </div>
    </div>
  );
}
