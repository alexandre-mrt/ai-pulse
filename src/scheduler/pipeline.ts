import crypto from "node:crypto";
import type { Config } from "../config/index.ts";
import { loadConfig } from "../config/index.ts";
import { generateAllContent } from "../engine/index.ts";
import { publishNewsletter, publishThread, publishYouTubeVideo } from "../publishers/index.ts";
import { createAggregator } from "../sources/index.ts";
import { getDatabase } from "../storage/database.ts";
import { createPipelineRun, savePublication, updatePipelineRun } from "../storage/publications.ts";
import type { GeneratedContent, PipelineStage, StageResult } from "../types/index.ts";
import { createLogger } from "../utils/index.ts";

const logger = createLogger("pipeline");

function generateRunId(): string {
  const date = new Date().toISOString().split("T")[0];
  const random = crypto.randomBytes(4).toString("hex");
  return `run_${date}_${random}`;
}

function createStage(stage: PipelineStage): StageResult {
  return {
    stage,
    status: "pending",
    startedAt: null,
    completedAt: null,
    error: null,
    metadata: {},
  };
}

function updateStage(
  stages: readonly StageResult[],
  stage: PipelineStage,
  update: Partial<StageResult>,
): readonly StageResult[] {
  return stages.map((s) => (s.stage === stage ? { ...s, ...update } : s));
}

async function runStage<T>(
  stages: readonly StageResult[],
  stageName: PipelineStage,
  fn: () => Promise<T>,
): Promise<{ readonly result: T | null; readonly stages: readonly StageResult[] }> {
  let updatedStages = updateStage(stages, stageName, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    const result = await fn();
    updatedStages = updateStage(updatedStages, stageName, {
      status: "success",
      completedAt: new Date(),
    });
    return { result, stages: updatedStages };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Stage ${stageName} failed: ${errorMessage}`);
    updatedStages = updateStage(updatedStages, stageName, {
      status: "failed",
      completedAt: new Date(),
      error: errorMessage,
    });
    return { result: null, stages: updatedStages };
  }
}

export async function runPipeline(config?: Config): Promise<void> {
  const cfg = config ?? loadConfig();
  const db = getDatabase(cfg.storage.dbPath);
  const runId = generateRunId();

  logger.info(`Starting pipeline run: ${runId}`);
  createPipelineRun(db, runId);

  let stages: readonly StageResult[] = [
    createStage("aggregation"),
    createStage("generation"),
    createStage("publishing_newsletter"),
    createStage("publishing_twitter"),
    createStage("publishing_youtube"),
  ];

  const aggregatorResult = await runStage(stages, "aggregation", () => createAggregator(cfg));
  stages = aggregatorResult.stages;

  if (!aggregatorResult.result) {
    updatePipelineRun(db, runId, { status: "failed", stages, error: "Aggregation failed" });
    logger.error("Pipeline aborted: aggregation failed");
    return;
  }

  const digest = aggregatorResult.result;
  logger.info(
    `Aggregated ${digest.articles.length} articles, ${digest.topStories.length} top stories`,
  );

  const generationResult = await runStage(stages, "generation", () =>
    generateAllContent(cfg, digest),
  );
  stages = generationResult.stages;

  if (!generationResult.result) {
    updatePipelineRun(db, runId, { status: "failed", stages, error: "Generation failed" });
    logger.error("Pipeline aborted: content generation failed");
    return;
  }

  const content: GeneratedContent = generationResult.result;

  const [nlResult, twResult, ytResult] = await Promise.allSettled([
    runStage(stages, "publishing_newsletter", () => publishNewsletter(cfg, content.newsletter)),
    runStage(stages, "publishing_twitter", () => publishThread(cfg, content.twitter)),
    runStage(stages, "publishing_youtube", () => publishYouTubeVideo(cfg, content.youtube)),
  ]);

  const mergeStageResult = (
    base: readonly StageResult[],
    result: PromiseSettledResult<{
      readonly result: unknown;
      readonly stages: readonly StageResult[];
    }>,
    stageName: PipelineStage,
  ): readonly StageResult[] => {
    if (result.status === "fulfilled") {
      const updated = result.value.stages.find((s) => s.stage === stageName);
      if (updated) return base.map((s) => (s.stage === stageName ? updated : s));
    }
    return base.map((s) =>
      s.stage === stageName
        ? { ...s, status: "failed" as const, completedAt: new Date(), error: "Promise rejected" }
        : s,
    );
  };

  stages = mergeStageResult(stages, nlResult, "publishing_newsletter");
  stages = mergeStageResult(stages, twResult, "publishing_twitter");
  stages = mergeStageResult(stages, ytResult, "publishing_youtube");

  if (nlResult.status === "fulfilled" && nlResult.value.result) {
    const r = nlResult.value.result;
    savePublication(db, {
      id: `pub_nl_${runId}`,
      pipelineRunId: runId,
      channel: "newsletter",
      publishedAt: new Date(),
      externalId: r.id,
      externalUrl: r.url,
      status: "published",
      metadata: {},
    });
  }
  if (twResult.status === "fulfilled" && twResult.value.result) {
    const r = twResult.value.result;
    savePublication(db, {
      id: `pub_tw_${runId}`,
      pipelineRunId: runId,
      channel: "twitter",
      publishedAt: new Date(),
      externalId: r.tweetIds[0] ?? null,
      externalUrl: r.firstTweetUrl,
      status: "published",
      metadata: { tweetCount: r.tweetIds.length },
    });
  }
  if (ytResult.status === "fulfilled" && ytResult.value.result) {
    const r = ytResult.value.result;
    savePublication(db, {
      id: `pub_yt_${runId}`,
      pipelineRunId: runId,
      channel: "youtube",
      publishedAt: new Date(),
      externalId: r.videoId,
      externalUrl: r.url,
      status: "published",
      metadata: { duration: r.duration },
    });
  }

  const allSucceeded = stages.every((s) => s.status === "success" || s.status === "pending");
  const anySucceeded = stages.some((s) => s.status === "success");

  let finalStatus: "success" | "partial" | "failed";
  if (allSucceeded) {
    finalStatus = "success";
  } else if (anySucceeded) {
    finalStatus = "partial";
  } else {
    finalStatus = "failed";
  }
  updatePipelineRun(db, runId, { status: finalStatus, stages });

  logger.info(`Pipeline ${runId} completed: ${finalStatus}`);
}

if (import.meta.main) {
  runPipeline().catch((error) => {
    logger.error("Pipeline crashed", error);
    process.exit(1);
  });
}
