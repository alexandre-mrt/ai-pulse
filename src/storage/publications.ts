import type { Database } from "bun:sqlite";
import type { PipelineRun, PublicationRecord, StageResult } from "../types/index.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("storage:publications");

export function createPipelineRun(db: Database, id: string): void {
  db.prepare(
    `INSERT INTO pipeline_runs (id, started_at, status) VALUES (?, datetime('now'), 'running')`,
  ).run(id);
  logger.info(`Created pipeline run: ${id}`);
}

export function updatePipelineRun(
  db: Database,
  id: string,
  updates: {
    readonly status?: string;
    readonly stages?: readonly StageResult[];
    readonly error?: string | null;
  },
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.status) {
    sets.push("status = ?");
    values.push(updates.status);
    if (updates.status === "success" || updates.status === "failed") {
      sets.push("completed_at = datetime('now')");
    }
  }
  if (updates.stages) {
    sets.push("stages = ?");
    values.push(JSON.stringify(updates.stages));
  }
  if (updates.error !== undefined) {
    sets.push("error = ?");
    values.push(updates.error);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE pipeline_runs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getLatestPipelineRun(db: Database): PipelineRun | null {
  const row = db
    .prepare(`SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1`)
    .get() as Record<string, unknown> | null;

  if (!row) return null;

  return {
    id: row.id as string,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    status: row.status as PipelineRun["status"],
    stages: JSON.parse((row.stages as string) || "[]") as readonly StageResult[],
    error: (row.error as string) || null,
  };
}

export function savePublication(db: Database, record: PublicationRecord): void {
  db.prepare(
    `INSERT INTO publications (id, pipeline_run_id, channel, published_at, external_id, external_url, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.pipelineRunId,
    record.channel,
    record.publishedAt.toISOString(),
    record.externalId,
    record.externalUrl,
    record.status,
    JSON.stringify(record.metadata),
  );
  logger.info(`Saved publication: ${record.channel} (${record.status})`);
}

export function getRecentPublications(
  db: Database,
  limit: number,
): readonly PublicationRecord[] {
  const rows = db
    .prepare(`SELECT * FROM publications ORDER BY published_at DESC LIMIT ?`)
    .all(limit) as ReadonlyArray<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    pipelineRunId: row.pipeline_run_id as string,
    channel: row.channel as PublicationRecord["channel"],
    publishedAt: new Date(row.published_at as string),
    externalId: (row.external_id as string) || null,
    externalUrl: (row.external_url as string) || null,
    status: row.status as PublicationRecord["status"],
    metadata: JSON.parse((row.metadata as string) || "{}") as Readonly<Record<string, unknown>>,
  }));
}
