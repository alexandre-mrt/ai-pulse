import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Config } from "../../config/index.ts";
import type { YouTubeScript } from "../../types/index.ts";
import { createLogger } from "../../utils/index.ts";
import { generateAllAudio } from "./tts.ts";
import { uploadVideo } from "./upload.ts";
import { assembleVideo } from "./video.ts";

const logger = createLogger("publisher:youtube");

interface YouTubePublishResult {
  readonly videoId: string;
  readonly url: string;
  readonly videoPath: string;
  readonly duration: number;
}

async function cleanupTempFiles(videoPath: string): Promise<void> {
  try {
    const dir = dirname(videoPath);
    await rm(dir, { recursive: true, force: true });
    logger.info(`Cleaned up temp files: ${dir}`);
  } catch (error) {
    logger.warn("Failed to cleanup temp files", { error });
  }
}

export async function publishYouTubeVideo(
  config: Config,
  script: YouTubeScript,
): Promise<YouTubePublishResult> {
  logger.info(`Starting YouTube pipeline for: ${script.title}`);

  const audioSegments = await generateAllAudio(config, script.sections);
  logger.info(`TTS complete: ${audioSegments.length} segments`);

  const videoOutput = await assembleVideo(script, audioSegments);
  logger.info(`Video assembled: ${videoOutput.videoPath}`);

  const uploadResult = await uploadVideo(config, script, videoOutput.videoPath);
  logger.info(`YouTube video published: ${uploadResult.url}`);

  await cleanupTempFiles(videoOutput.videoPath);

  return {
    videoId: uploadResult.videoId,
    url: uploadResult.url,
    videoPath: videoOutput.videoPath,
    duration: videoOutput.duration,
  };
}
