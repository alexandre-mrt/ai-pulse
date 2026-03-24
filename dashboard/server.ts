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
const DASHBOARD_HOST = process.env["DASHBOARD_HOST"] ?? "127.0.0.1";
const DASHBOARD_SECRET = process.env["DASHBOARD_SECRET"];
const PIPELINE_SCRIPT = "../src/scheduler/pipeline.ts";

if (!DASHBOARD_SECRET) {
  throw new Error(
    "DASHBOARD_SECRET must be set. Dashboard cannot start without authentication.",
  );
}

let lastTriggerTime = 0;
const TRIGGER_COOLDOWN_MS = 300_000;

function isAuthorized(req: Request): boolean {
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
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

function withAuth<T>(
  req: Request,
  handler: () => Response,
): Response {
  if (!isAuthorized(req)) {
    return jsonResponse<T>({ success: false, error: "Unauthorized" } as ApiResponse<T>, 401);
  }
  return handler();
}

function safeDbQuery<T>(label: string, fn: () => ApiResponse<T>): Response {
  try {
    return jsonResponse(fn());
  } catch (err) {
    console.error(`Dashboard ${label} error:`, err);
    return jsonResponse<T>({ success: false, error: "Internal server error" } as ApiResponse<T>, 500);
  }
}

Bun.serve({
  hostname: DASHBOARD_HOST,
  port: DASHBOARD_PORT,
  routes: {
    "/": index,

    "/api/status": {
      GET(req: Request): Response {
        return withAuth<StatusResponse>(req, () =>
          safeDbQuery<StatusResponse>("status", () => {
            const db = openDashboardDb();
            const row = db
              .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1")
              .get() as PipelineRunRow | null;
            db.close();
            return { success: true, data: { latestRun: row ? mapPipelineRun(row) : null } };
          }),
        );
      },
    },

    "/api/publications": {
      GET(req: Request): Response {
        return withAuth<readonly PublicationDto[]>(req, () =>
          safeDbQuery<readonly PublicationDto[]>("publications", () => {
            const db = openDashboardDb();
            const rows = db
              .prepare("SELECT * FROM publications ORDER BY published_at DESC LIMIT 30")
              .all() as readonly PublicationRow[];
            db.close();
            return { success: true, data: rows.map(mapPublication) };
          }),
        );
      },
    },

    "/api/pipeline-runs": {
      GET(req: Request): Response {
        return withAuth<readonly PipelineRunDto[]>(req, () =>
          safeDbQuery<readonly PipelineRunDto[]>("pipeline-runs", () => {
            const db = openDashboardDb();
            const rows = db
              .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 20")
              .all() as readonly PipelineRunRow[];
            db.close();
            return { success: true, data: rows.map(mapPipelineRun) };
          }),
        );
      },
    },

    "/api/trigger": {
      POST(req: Request): Response {
        return withAuth<TriggerResponse>(req, () => {
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
            console.error("Dashboard trigger error:", err);
            return jsonResponse<TriggerResponse>(
              { success: false, error: "Failed to trigger pipeline" },
              500,
            );
          }
        });
      },
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`AI Pulse Dashboard running at http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`);
