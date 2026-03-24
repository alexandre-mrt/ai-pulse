export type PipelineStatus = "idle" | "running" | "success" | "failed" | "partial";

export type StageStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type PublicationChannel = "newsletter" | "twitter" | "youtube";

export type PublicationStatus = "published" | "scheduled" | "draft" | "failed";

export interface StageResult {
  readonly stage: string;
  readonly status: StageStatus;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PipelineRunRow {
  readonly id: string;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly status: PipelineStatus;
  readonly stages: string;
  readonly error: string | null;
}

export interface PipelineRunDto {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: PipelineStatus;
  readonly stages: readonly StageResult[];
  readonly error: string | null;
  readonly durationMs: number | null;
}

export interface PublicationRow {
  readonly id: string;
  readonly pipeline_run_id: string;
  readonly channel: PublicationChannel;
  readonly published_at: string;
  readonly external_id: string | null;
  readonly external_url: string | null;
  readonly status: PublicationStatus;
  readonly metadata: string;
}

export interface PublicationDto {
  readonly id: string;
  readonly pipelineRunId: string;
  readonly channel: PublicationChannel;
  readonly publishedAt: string;
  readonly externalId: string | null;
  readonly externalUrl: string | null;
  readonly status: PublicationStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface StatusResponse {
  readonly latestRun: PipelineRunDto | null;
}

export interface TriggerResponse {
  readonly triggered: boolean;
  readonly message: string;
}
