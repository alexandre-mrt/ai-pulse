import type { Config } from "../config/index.ts";
import { loadConfig } from "../config/index.ts";
import { generateAllContent } from "../engine/index.ts";
import { publishNewsletter, publishThread, publishYouTubeVideo } from "../publishers/index.ts";
import { createAggregator } from "../sources/index.ts";
import { getDatabase } from "../storage/database.ts";
import { createPipelineRun, savePublication, updatePipelineRun } from "../storage/publications.ts";
import type {
  GeneratedContent,
  PipelineStage,
  PublicationRecord,
  StageResult,
} from "../types/index.ts";
import { createLogger } from "../utils/index.ts";

const logger = createLogger("pipeline");

function generateRunId(): string {
  const date = new Date().toISOString().split("T")[0];
  const random = Math.random().toString(36).substring(2, 8);
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

  const aggregatorResult = await runStage(stages, "aggregation", async () => {
    const aggregator = createAggregator(cfg);
    return aggregator.aggregate();
  });
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

  await Promise.allSettled([
    (async () => {
      const r = await runStage(stages, "publishing_newsletter", () =>
        publishNewsletter(cfg, content.newsletter),
      );
      stages = r.stages;
      if (r.result) {
        const pub: PublicationRecord = {
          id: `pub_nl_${runId}`,
          pipelineRunId: runId,
          channel: "newsletter",
          publishedAt: new Date(),
          externalId: r.result.id,
          externalUrl: r.result.url,
          status: "published",
          metadata: {},
        };
        savePublication(db, pub);
      }
    })(),
    (async () => {
      const r = await runStage(stages, "publishing_twitter", () =>
        publishThread(cfg, content.twitter),
      );
      stages = r.stages;
      if (r.result) {
        const pub: PublicationRecord = {
          id: `pub_tw_${runId}`,
          pipelineRunId: runId,
          channel: "twitter",
          publishedAt: new Date(),
          externalId: r.result.tweetIds[0] ?? null,
          externalUrl: r.result.firstTweetUrl,
          status: "published",
          metadata: { tweetCount: r.result.tweetIds.length },
        };
        savePublication(db, pub);
      }
    })(),
    (async () => {
      const r = await runStage(stages, "publishing_youtube", () =>
        publishYouTubeVideo(cfg, content.youtube),
      );
      stages = r.stages;
      if (r.result) {
        const pub: PublicationRecord = {
          id: `pub_yt_${runId}`,
          pipelineRunId: runId,
          channel: "youtube",
          publishedAt: new Date(),
          externalId: r.result.videoId,
          externalUrl: r.result.url,
          status: "published",
          metadata: { duration: r.result.duration },
        };
        savePublication(db, pub);
      }
    })(),
  ]);

  const allSucceeded = stages.every((s) => s.status === "success" || s.status === "pending");
  const anySucceeded = stages.some((s) => s.status === "success");

  const finalStatus = allSucceeded ? "success" : anySucceeded ? "partial" : "failed";
  updatePipelineRun(db, runId, { status: finalStatus, stages });

  logger.info(`Pipeline ${runId} completed: ${finalStatus}`);
}

if (import.meta.main) {
  runPipeline().catch((error) => {
    logger.error("Pipeline crashed", error);
    process.exit(1);
  });
}
