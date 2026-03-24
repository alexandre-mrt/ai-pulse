import { openDashboardDb } from "./lib/db.ts";
import type {
  ApiResponse,
  PipelineRunDto,
  PipelineRunRow,
  PublicationDto,
  PublicationRow,
  StatusResponse,
  StageResult,
  TriggerResponse,
} from "./lib/types.ts";
import index from "./index.html";

const DASHBOARD_PORT = Number(process.env["DASHBOARD_PORT"] ?? 3001);
const DASHBOARD_SECRET = process.env["DASHBOARD_SECRET"] ?? "";
const PIPELINE_SCRIPT = "../src/scheduler/pipeline.ts";

let lastTriggerTime = 0;
const TRIGGER_COOLDOWN_MS = 300_000;

function isAuthorized(req: Request): boolean {
  if (!DASHBOARD_SECRET) return true;
  const authHeader = req.headers.get("Authorization");
  return authHeader === `Bearer ${DASHBOARD_SECRET}`;
}

function mapPipelineRun(row: PipelineRunRow): PipelineRunDto {
  const stages = JSON.parse(row.stages || "[]") as readonly StageResult[];
  const startedAt = row.started_at;
  const completedAt = row.completed_at ?? null;
  const durationMs =
    completedAt !== null
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : null;
  return {
    id: row.id,
    startedAt,
    completedAt,
    status: row.status,
    stages,
    error: row.error,
    durationMs,
  };
}

function mapPublication(row: PublicationRow): PublicationDto {
  return {
    id: row.id,
    pipelineRunId: row.pipeline_run_id,
    channel: row.channel,
    publishedAt: row.published_at,
    externalId: row.external_id,
    externalUrl: row.external_url,
    status: row.status,
    metadata: JSON.parse(row.metadata || "{}") as Readonly<Record<string, unknown>>,
  };
}

function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: DASHBOARD_PORT,
  routes: {
    "/": index,

    "/api/status": {
      GET(): Response {
        try {
          const db = openDashboardDb();
          const row = db
            .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1")
            .get() as PipelineRunRow | null;
          db.close();
          const response: ApiResponse<StatusResponse> = {
            success: true,
            data: { latestRun: row ? mapPipelineRun(row) : null },
          };
          return jsonResponse(response);
        } catch (err) {
          const response: ApiResponse<StatusResponse> = {
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch status",
          };
          return jsonResponse(response, 500);
        }
      },
    },

    "/api/publications": {
      GET(): Response {
        try {
          const db = openDashboardDb();
          const rows = db
            .prepare("SELECT * FROM publications ORDER BY published_at DESC LIMIT 30")
            .all() as readonly PublicationRow[];
          db.close();
          const response: ApiResponse<readonly PublicationDto[]> = {
            success: true,
            data: rows.map(mapPublication),
          };
          return jsonResponse(response);
        } catch (err) {
          const response: ApiResponse<readonly PublicationDto[]> = {
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch publications",
          };
          return jsonResponse(response, 500);
        }
      },
    },

    "/api/pipeline-runs": {
      GET(): Response {
        try {
          const db = openDashboardDb();
          const rows = db
            .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 20")
            .all() as readonly PipelineRunRow[];
          db.close();
          const response: ApiResponse<readonly PipelineRunDto[]> = {
            success: true,
            data: rows.map(mapPipelineRun),
          };
          return jsonResponse(response);
        } catch (err) {
          const response: ApiResponse<readonly PipelineRunDto[]> = {
            success: false,
            error: err instanceof Error ? err.message : "Failed to fetch pipeline runs",
          };
          return jsonResponse(response, 500);
        }
      },
    },

    "/api/trigger": {
      POST(req: Request): Response {
        if (!isAuthorized(req)) {
          return jsonResponse<TriggerResponse>(
            { success: false, error: "Unauthorized" },
            401,
          );
        }

        const now = Date.now();
        if (now - lastTriggerTime < TRIGGER_COOLDOWN_MS) {
          const waitSec = Math.ceil((TRIGGER_COOLDOWN_MS - (now - lastTriggerTime)) / 1000);
          return jsonResponse<TriggerResponse>(
            { success: false, error: `Rate limited. Try again in ${waitSec}s` },
            429,
          );
        }

        try {
          lastTriggerTime = now;
          Bun.spawn(["bun", "run", PIPELINE_SCRIPT], {
            cwd: "..",
            stdout: "ignore",
            stderr: "ignore",
          });
          return jsonResponse<TriggerResponse>({
            success: true,
            data: { triggered: true, message: "Pipeline triggered successfully" },
          });
        } catch (err) {
          return jsonResponse<TriggerResponse>({
            success: false,
            error: err instanceof Error ? err.message : "Failed to trigger pipeline",
          }, 500);
        }
      },
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`AI Pulse Dashboard running at http://localhost:${DASHBOARD_PORT}`);
