import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ApiResponse,
  PipelineRunDto,
  PipelineStatus,
  PublicationDto,
  PublicationChannel,
  StatusResponse,
  TriggerResponse,
} from "./lib/types.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function statusBadgeClass(status: PipelineStatus | string): string {
  const map: Record<string, string> = {
    success: "badge badge-success",
    partial: "badge badge-partial",
    failed: "badge badge-failed",
    running: "badge badge-running",
    idle: "badge badge-idle",
    pending: "badge badge-idle",
    skipped: "badge badge-idle",
  };
  return map[status] ?? "badge badge-idle";
}

function channelClass(channel: PublicationChannel): string {
  const map: Record<PublicationChannel, string> = {
    newsletter: "pub-channel pub-channel-newsletter",
    twitter: "pub-channel pub-channel-twitter",
    youtube: "pub-channel pub-channel-youtube",
  };
  return map[channel];
}

// ── hooks ────────────────────────────────────────────────────────────────────

function useFetch<T>(url: string, refreshKey: number): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(url)
      .then((r) => r.json() as Promise<ApiResponse<T>>)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data !== undefined) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error ?? "Unknown error");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Fetch failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);

  return { data, error, loading };
}

// ── StatusCard ────────────────────────────────────────────────────────────────

function StatusCard({ refreshKey }: { readonly refreshKey: number }): React.ReactElement {
  const { data, error, loading } = useFetch<StatusResponse>("/api/status", refreshKey);
  const run = data?.latestRun ?? null;

  if (loading) return <div className="card"><p className="loading">Loading status...</p></div>;
  if (error) return <div className="card"><p className="error-msg">{error}</p></div>;

  return (
    <div className="card">
      <p className="card-title">Latest Pipeline Run</p>

      {run === null ? (
        <p className="empty">No pipeline runs recorded yet.</p>
      ) : (
        <>
          <div className="status-row">
            <span className="status-label">Status</span>
            <span className={statusBadgeClass(run.status)}>
              <span className="badge-dot" />
              {run.status}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">Started</span>
            <span className="status-value">{formatDate(run.startedAt)}</span>
          </div>
          <div className="status-row">
            <span className="status-label">Completed</span>
            <span className="status-value">{formatDate(run.completedAt)}</span>
          </div>
          <div className="status-row">
            <span className="status-label">Duration</span>
            <span className="status-value">{formatDuration(run.durationMs)}</span>
          </div>
          {run.error && (
            <div className="status-row">
              <span className="status-label">Error</span>
              <span className="status-value" style={{ color: "var(--status-failed)", fontSize: "12px" }}>
                {run.error}
              </span>
            </div>
          )}

          {run.stages.length > 0 && (
            <div className="stages-list">
              {run.stages.map((stage) => (
                <div key={stage.stage} className="stage-item">
                  <span className={`stage-icon stage-icon-${stage.status}`} />
                  <span className="stage-name">{stage.stage.replace(/_/g, " ")}</span>
                  <span className="stage-status">{stage.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── TriggerButton ─────────────────────────────────────────────────────────────

function TriggerButton(): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);

  const handleTrigger = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/trigger", { method: "POST" });
      const json = (await res.json()) as ApiResponse<TriggerResponse>;
      if (json.success && json.data) {
        setMessage({ text: json.data.message, success: true });
      } else {
        setMessage({ text: json.error ?? "Trigger failed", success: false });
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Trigger failed", success: false });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="card">
      <p className="card-title">Manual Trigger</p>
      <div className="trigger-section">
        <button
          type="button"
          className="trigger-btn"
          disabled={loading}
          onClick={handleTrigger}
        >
          {loading ? "Triggering..." : "Run Pipeline Now"}
        </button>
        {message && (
          <span className={`trigger-msg ${message.success ? "trigger-msg-success" : "trigger-msg-error"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ── PublicationsGrid ──────────────────────────────────────────────────────────

function PublicationsGrid({ refreshKey }: { readonly refreshKey: number }): React.ReactElement {
  const { data, error, loading } = useFetch<readonly PublicationDto[]>("/api/publications", refreshKey);

  if (loading) return <div className="card"><p className="loading">Loading publications...</p></div>;
  if (error) return <div className="card"><p className="error-msg">{error}</p></div>;

  const pubs = data ?? [];

  return (
    <div className="card">
      <p className="card-title">Recent Publications ({pubs.length})</p>

      {pubs.length === 0 ? (
        <p className="empty">No publications yet.</p>
      ) : (
        <div className="pub-grid">
          {pubs.map((pub) => (
            <div key={pub.id} className="pub-card">
              <div className="pub-card-header">
                <span className={channelClass(pub.channel)}>{pub.channel}</span>
                <span className="pub-date">{formatDate(pub.publishedAt)}</span>
              </div>
              <p className="pub-status">
                Status: <strong>{pub.status}</strong>
              </p>
              {pub.externalUrl && (
                <a
                  href={pub.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pub-link"
                >
                  View ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PipelineHistory ───────────────────────────────────────────────────────────

function PipelineHistory({ refreshKey }: { readonly refreshKey: number }): React.ReactElement {
  const { data, error, loading } = useFetch<readonly PipelineRunDto[]>("/api/pipeline-runs", refreshKey);

  if (loading) return <div className="card"><p className="loading">Loading history...</p></div>;
  if (error) return <div className="card"><p className="error-msg">{error}</p></div>;

  const runs = data ?? [];

  return (
    <div className="card">
      <p className="card-title">Pipeline History</p>

      {runs.length === 0 ? (
        <p className="empty">No pipeline runs yet.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Stages</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="td-mono">{run.id.slice(0, 8)}…</td>
                  <td>
                    <span className={statusBadgeClass(run.status)}>
                      <span className="badge-dot" />
                      {run.status}
                    </span>
                  </td>
                  <td className="td-muted">{formatDate(run.startedAt)}</td>
                  <td className="td-muted">{formatDuration(run.durationMs)}</td>
                  <td className="td-muted">
                    {run.stages.length > 0
                      ? `${run.stages.filter((s) => s.status === "success").length}/${run.stages.length} ok`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App(): React.ReactElement {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">
          AI <span>Pulse</span> Dashboard
        </h1>
        <div>
          <p className="header-meta">{new Date().toLocaleDateString()}</p>
          <p className="refresh-hint">Auto-refreshes every 30s</p>
        </div>
      </header>

      <div className="grid-2">
        <StatusCard refreshKey={refreshKey} />
        <TriggerButton />
      </div>

      <PublicationsGrid refreshKey={refreshKey} />
      <PipelineHistory refreshKey={refreshKey} />
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(<App />);
