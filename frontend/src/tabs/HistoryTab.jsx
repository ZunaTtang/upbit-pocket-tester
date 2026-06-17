import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { METHOD_BADGE } from "../endpoints";
import JsonView from "../components/JsonView";
import ReqRespViewer from "../components/ReqRespViewer";

function parseMaybe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default function HistoryTab() {
  const { baseUrl, notify } = useStore();
  const [logs, setLogs] = useState([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [rerun, setRerun] = useState({}); // logId -> result

  // client-side filters
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dryOnly, setDryOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  async function load() {
    try {
      setLogs(await api.listLogs(q, 300));
    } catch (e) {
      notify("로그 조회 실패: " + e.message, "error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doRerun(log) {
    if (log.method !== "GET" && !window.confirm("쓰기 호출입니다. 실거래로 다시 전송됩니다. 계속할까요?")) return;
    const path = (log.url || "").replace(baseUrl, "").split("?")[0];
    try {
      const res = await api.proxy({
        key_id: log.key_id,
        method: log.method,
        path,
        params: log.params || {},
        authenticated: !!log.key_id,
        write: log.method !== "GET",
        dry_run: false,
        endpoint_id: log.endpoint_id,
        label: log.label + " (재실행)",
      });
      setRerun((r) => ({ ...r, [log.id]: res }));
      if (res.blocked) notify(res.reason, "error");
      load();
    } catch (e) {
      notify("재실행 실패: " + e.message, "error");
    }
  }

  const filtered = logs.filter((log) => {
    if (methodFilter !== "all" && log.method !== methodFilter) return false;
    if (statusFilter === "2xx" && !(log.status != null && log.status < 300)) return false;
    if (statusFilter === "err4xx5xx" && !(log.status != null && log.status >= 400)) return false;
    if (statusFilter === "error" && !log.error) return false;
    if (dryOnly && !log.dry_run) return false;
    if (verifiedOnly && !log.verify_state) return false;
    return true;
  });

  return (
    <div className="max-w-5xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="section-title text-lg">히스토리</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="검색(엔드포인트/URL/바디)…"
          className="field-input ml-auto w-72"
        />
        <button onClick={load} className="btn-ghost btn-sm">검색/새로고침</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="field-input w-auto">
          <option value="all">전체 메서드</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="field-input w-auto">
          <option value="all">전체 상태</option>
          <option value="2xx">2xx 성공</option>
          <option value="err4xx5xx">4xx·5xx</option>
          <option value="error">에러</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-700">
          <input type="checkbox" checked={dryOnly} onChange={(e) => setDryOnly(e.target.checked)} />
          <span>Dry-run만</span>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-700">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          <span>검증 기록만</span>
        </label>
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="text-3xl">🕑</div>
            <p>로그가 없습니다.</p>
          </div>
        )}
        {filtered.map((log) => {
          const isOpen = openId === log.id;
          const ok = log.status != null && log.status < 300;
          return (
            <div key={log.id} className="card">
              <button onClick={() => setOpenId(isOpen ? null : log.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm">
                <span className="text-xs text-ink-500 w-40 shrink-0">{new Date(log.ts).toLocaleString()}</span>
                <span className={METHOD_BADGE[log.method] || "badge-get"}>{log.method}</span>
                <span className="font-medium text-ink-700 truncate">{log.label || log.endpoint_id}</span>
                {log.dry_run && <span className="badge bg-accent-indigo-100 text-accent-indigo-700">DRY</span>}
                {log.error && <span className="badge bg-danger-100 text-danger-700">ERR</span>}
                {log.verify_state && <span className="badge bg-ok-100 text-ok-700">✓검증</span>}
                <span className="ml-auto flex items-center gap-2 text-xs">
                  {log.status != null && <span className={ok ? "text-ok-600 font-semibold" : "text-warn-600 font-semibold"}>{log.status}</span>}
                  {log.latency_ms != null && <span className="text-ink-400">{log.latency_ms}ms</span>}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="text-xs font-mono text-ink-500 break-words">{log.url}</div>
                  {log.remaining_req && <div className="text-xs text-ink-500">Remaining-Req: <span className="font-mono">{log.remaining_req}</span></div>}
                  {log.error && <div className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-control p-2">{log.error}</div>}
                  <div className="grid md:grid-cols-2 gap-2">
                    <JsonView title="요청 바디/파라미터" data={parseMaybe(log.request_body) || log.params} defaultOpen={false} />
                    <JsonView title="응답" data={parseMaybe(log.response_body)} defaultOpen={false} />
                  </div>
                  {log.verify_state && (
                    <JsonView title="저장된 검증 체크리스트" data={log.verify_state} defaultOpen={false} />
                  )}
                  <button onClick={() => doRerun(log)} className="btn-ghost btn-sm border-brand-300 text-brand-700 hover:bg-brand-50">↻ 재실행</button>
                  {rerun[log.id] && (
                    <div className="border-t border-ink-200 pt-2">
                      <div className="text-xs font-semibold text-ink-500">재실행 결과</div>
                      <ReqRespViewer result={rerun[log.id]} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
