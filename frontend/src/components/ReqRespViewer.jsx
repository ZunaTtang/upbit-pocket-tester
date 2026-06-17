import { useState, useEffect } from "react";
import { summarize } from "../summarize";
import JsonView, { CopyButton } from "./JsonView";

// status 코드 → 배지 토큰. null→ink, 2xx→ok, 4xx→warn, 5xx→danger.
function statusBadgeClass(status) {
  if (status == null) return "bg-ink-200 text-ink-700";
  if (status < 300) return "bg-ok-100 text-ok-800";
  if (status < 500) return "bg-warn-100 text-warn-800";
  return "bg-danger-100 text-danger-700";
}

// summary row.tone → dd 색 토큰.
function toneClass(tone) {
  if (tone === "pos") return "text-ok-600";
  if (tone === "neg") return "text-danger-600";
  if (tone === "muted") return "text-ink-400";
  return "";
}

// badge.tone → badge 색 토큰.
function badgeToneClass(tone) {
  if (tone === "pos") return "bg-ok-100 text-ok-800";
  if (tone === "neg") return "bg-danger-100 text-danger-700";
  if (tone === "warn") return "bg-warn-100 text-warn-800";
  return "bg-ink-100 text-ink-700";
}

function Badge({ badge }) {
  if (!badge || !badge.text) return null;
  return <span className={`badge ${badgeToneClass(badge.tone)}`}>{badge.text}</span>;
}

function RowTable({ rows }) {
  const list = (rows || []).filter((r) => r && r.label != null);
  if (!list.length) return null;
  return (
    <dl>
      {list.map((r, i) => (
        <div
          key={i}
          className="flex gap-2 py-0.5 border-b border-ink-100 last:border-0"
        >
          <dt className="text-[11px] text-ink-500 w-32 shrink-0">{r.label}</dt>
          <dd
            className={`text-xs ${r.mono ? "font-mono break-words" : ""} ${toneClass(
              r.tone
            )}`.trim()}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryView({ summary }) {
  if (!summary) return null;

  if (summary.kind === "error") {
    const e = summary.error || {};
    const detailRows = [
      e.name ? { label: "name", value: e.name, mono: true } : null,
      e.message ? { label: "message", value: e.message } : null,
    ].filter(Boolean);
    return (
      <div className="callout border-danger-200 bg-danger-50 text-danger-700">
        <div className="section-title text-sm text-danger-700">
          {summary.title || "오류"}
        </div>
        {e.friendly && (
          <div className="mt-1 text-sm font-semibold text-danger-700">
            {e.friendly}
          </div>
        )}
        {detailRows.length > 0 && (
          <div className="mt-2">
            <RowTable rows={detailRows} />
          </div>
        )}
        {summary.note && <div className="field-help mt-2">{summary.note}</div>}
      </div>
    );
  }

  const rows = summary.rows || [];
  const items = summary.items || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="section-title text-sm">{summary.title}</span>
        <Badge badge={summary.badge} />
      </div>
      {summary.note && <div className="field-help">{summary.note}</div>}
      {rows.length > 0 && <RowTable rows={rows} />}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="card p-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-700">
                  {it.title}
                </span>
                <Badge badge={it.badge} />
              </div>
              <div className="mt-1">
                <RowTable rows={it.rows} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 응답 패널 — 요약/JSON 토글. 요약 가능 시 요약을 기본으로.
function ResponsePanel({ result }) {
  const body = result.response ? result.response.body : null;
  const endpointId = result.endpoint_id || result.request?.endpoint_id;
  const status = result.response?.status;
  const summary = body != null ? summarize(endpointId, body, status) : null;
  const canSummarize = !!summary;

  const [view, setView] = useState(canSummarize ? "summary" : "json");

  useEffect(() => {
    setView(canSummarize ? "summary" : "json");
    // body 가 바뀌면 기본 뷰 재설정.
  }, [body, canSummarize]);

  const jsonText =
    body != null
      ? typeof body === "string"
        ? body
        : JSON.stringify(body, null, 2)
      : result.dry_run
      ? "(dry-run: 전송하지 않음)"
      : "(응답 없음)";

  return (
    <div className="border border-ink-200 rounded-control bg-ink-50">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-ink-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView("summary")}
            disabled={!canSummarize}
            title={canSummarize ? undefined : "요약할 수 없는 응답입니다"}
            className={`btn-ghost btn-sm ${
              view === "summary" ? "bg-brand-600 text-white" : ""
            }`}
          >
            요약
          </button>
          <button
            type="button"
            onClick={() => setView("json")}
            className={`btn-ghost btn-sm ${
              view === "json" ? "bg-brand-600 text-white" : ""
            }`}
          >
            JSON
          </button>
        </div>
        <CopyButton value={jsonText} />
      </div>
      <div className="p-3">
        {view === "summary" && canSummarize ? (
          <SummaryView summary={summary} />
        ) : (
          <pre className="json-block overflow-auto" style={{ maxHeight: "24rem" }}>
            {jsonText}
          </pre>
        )}
      </div>
    </div>
  );
}

// 요청/응답 + status / latency / Remaining-Req.
export default function ReqRespViewer({ result }) {
  if (!result) return null;
  const { request, response, dry_run, blocked, reason, error } = result;
  const status = response && response.status;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {blocked && (
          <span className="badge bg-danger-100 text-danger-700">
            차단됨(로컬 안전장치)
          </span>
        )}
        {dry_run && (
          <span className="badge bg-accent-indigo-100 text-accent-indigo-700">
            DRY-RUN (전송 안 함)
          </span>
        )}
        {status != null && (
          <span className={`badge ${statusBadgeClass(status)}`}>HTTP {status}</span>
        )}
        {response && response.latency_ms != null && (
          <span className="text-ink-500">{response.latency_ms} ms</span>
        )}
        {response && response.remaining_req && (
          <span className="text-ink-500">
            Remaining-Req:{" "}
            <span className="font-mono">{response.remaining_req}</span>
          </span>
        )}
      </div>

      {(reason || error) && (
        <div className="callout border-danger-200 bg-danger-50 text-danger-700">
          {reason || error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
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
        <ResponsePanel result={result} />
      </div>
    </div>
  );
}
