import JsonView from "./JsonView";

// Request and response side-by-side, plus status / latency / Remaining-Req.
export default function ReqRespViewer({ result }) {
  if (!result) return null;
  const { request, response, dry_run, blocked, reason, error } = result;
  const status = response && response.status;
  const statusColor =
    status == null
      ? "bg-slate-200 text-slate-700"
      : status < 300
      ? "bg-emerald-100 text-emerald-800"
      : status < 500
      ? "bg-amber-100 text-amber-800"
      : "bg-rose-100 text-rose-800";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {blocked && (
          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
            차단됨(로컬 안전장치)
          </span>
        )}
        {dry_run && (
          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold">
            DRY-RUN (전송 안 함)
          </span>
        )}
        {status != null && (
          <span className={`px-2 py-0.5 rounded font-semibold ${statusColor}`}>
            HTTP {status}
          </span>
        )}
        {response && response.latency_ms != null && (
          <span className="text-slate-500">{response.latency_ms} ms</span>
        )}
        {response && response.remaining_req && (
          <span className="text-slate-500">
            Remaining-Req: <span className="font-mono">{response.remaining_req}</span>
          </span>
        )}
      </div>

      {(reason || error) && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
          {reason || error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-2">
        <JsonView
          title={`요청 ${request ? `(${request.method} ${request.url})` : ""}`}
          data={
            request
              ? {
                  method: request.method,
                  url: request.url,
                  query_string: request.query_string || undefined,
                  body: request.body || undefined,
                  headers: request.headers,
                }
              : "(요청 정보 없음)"
          }
        />
        <JsonView
          title="응답 (JSON)"
          data={response ? response.body : dry_run ? "(dry-run: 전송하지 않음)" : "(응답 없음)"}
        />
      </div>
    </div>
  );
}
