import type { SourceName } from "./article";

export type PipelineStage =
  | "aggregation"
  | "generation"
  | "publishing_newsletter"
  | "publishing_twitter"
  | "publishing_youtube";

export type PipelineStatus = "idle" | "running" | "success" | "failed" | "partial";

export interface PipelineRun {
  readonly id: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly status: PipelineStatus;
  readonly stages: readonly StageResult[];
  readonly error: string | null;
}

export interface StageResult {
  readonly stage: PipelineStage;
  readonly status: "pending" | "running" | "success" | "failed" | "skipped";
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly error: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PublicationRecord {
  readonly id: string;
  readonly pipelineRunId: string;
  readonly channel: "newsletter" | "twitter" | "youtube";
  readonly publishedAt: Date;
  readonly externalId: string | null;
  readonly externalUrl: string | null;
  readonly status: "published" | "scheduled" | "draft" | "failed";
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SourceProvider {
  readonly name: SourceName;
  fetch(): Promise<readonly import("./article").RawArticle[]>;
}
