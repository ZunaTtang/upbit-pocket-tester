import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
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

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-lg text-slate-800">히스토리</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="검색(엔드포인트/URL/바디)…"
          className="border border-slate-300 rounded px-2 py-1 text-sm ml-auto w-64"
        />
        <button onClick={load} className="text-xs px-3 py-1.5 border border-slate-300 rounded bg-white">검색/새로고침</button>
      </div>

      <div className="space-y-1.5">
        {logs.length === 0 && <p className="text-sm text-slate-500">로그가 없습니다.</p>}
        {logs.map((log) => {
          const isOpen = openId === log.id;
          const ok = log.status != null && log.status < 300;
          return (
            <div key={log.id} className="bg-white border border-slate-200 rounded">
              <button onClick={() => setOpenId(isOpen ? null : log.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm">
                <span className="text-slate-400 text-xs w-36 shrink-0">{new Date(log.ts).toLocaleString()}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${log.method === "GET" ? "bg-slate-100 text-slate-600" : "bg-rose-100 text-rose-700"}`}>{log.method}</span>
                <span className="font-medium text-slate-700 truncate">{log.label || log.endpoint_id}</span>
                {log.dry_run && <span className="text-[10px] px-1.5 rounded bg-indigo-100 text-indigo-700">DRY</span>}
                {log.error && <span className="text-[10px] px-1.5 rounded bg-rose-100 text-rose-700">ERR</span>}
                {log.verify_state && <span className="text-[10px] px-1.5 rounded bg-emerald-100 text-emerald-700">✓검증</span>}
                <span className="ml-auto flex items-center gap-2 text-xs">
                  {log.status != null && <span className={ok ? "text-emerald-600" : "text-amber-600"}>{log.status}</span>}
                  {log.latency_ms != null && <span className="text-slate-400">{log.latency_ms}ms</span>}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="text-xs font-mono text-slate-500 break-all">{log.url}</div>
                  {log.remaining_req && <div className="text-xs text-slate-500">Remaining-Req: <span className="font-mono">{log.remaining_req}</span></div>}
                  {log.error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{log.error}</div>}
                  <div className="grid md:grid-cols-2 gap-2">
                    <JsonView title="요청 바디/파라미터" data={parseMaybe(log.request_body) || log.params} defaultOpen={false} />
                    <JsonView title="응답" data={parseMaybe(log.response_body)} defaultOpen={false} />
                  </div>
                  {log.verify_state && (
                    <JsonView title="저장된 검증 체크리스트" data={log.verify_state} defaultOpen={false} />
                  )}
                  <button onClick={() => doRerun(log)} className="text-xs px-3 py-1 border border-sky-300 text-sky-700 rounded bg-white">↻ 재실행</button>
                  {rerun[log.id] && (
                    <div className="border-t border-slate-200 pt-2">
                      <div className="text-xs font-semibold text-slate-500">재실행 결과</div>
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
