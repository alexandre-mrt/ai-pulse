import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { YouTubeScript } from "../../types/index.ts";
import { createLogger } from "../../utils/index.ts";
import type { AudioSegment } from "./tts.ts";

const logger = createLogger("publisher:youtube:video");

const OUTPUT_DIR = "./data/videos";

interface VideoOutput {
  readonly videoPath: string;
  readonly duration: number;
  readonly segments: readonly AudioSegment[];
}

async function ensureOutputDir(): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}

async function writeAudioSegments(
  outputDir: string,
  segments: readonly AudioSegment[],
): Promise<readonly string[]> {
  const paths: string[] = [];

  for (const segment of segments) {
    const filename = `segment_${segment.sectionIndex.toString().padStart(3, "0")}.mp3`;
    const filePath = join(outputDir, filename);
    await Bun.write(filePath, segment.audioBuffer);
    paths.push(filePath);
    logger.debug(`Written audio segment: ${filePath}`);
  }

  return paths;
}

function buildFFmpegConcatFile(audioPaths: readonly string[]): string {
  return audioPaths.map((p) => `file '${p}'`).join("\n");
}

async function concatenateAudio(outputDir: string, audioPaths: readonly string[]): Promise<string> {
  const concatListPath = join(outputDir, "concat_list.txt");
  const concatContent = buildFFmpegConcatFile(audioPaths);
  await Bun.write(concatListPath, concatContent);

  const outputPath = join(outputDir, "full_audio.mp3");

  const result = Bun.spawn([
    "ffmpeg",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outputPath,
  ]);

  const exitCode = await result.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(result.stderr).text();
    throw new Error(`FFmpeg concat failed (exit ${exitCode}): ${stderr}`);
  }

  logger.info(`Audio concatenated: ${outputPath}`);
  return outputPath;
}

function buildTextOverlayFilter(script: YouTubeScript): string {
  const titleFilter = `drawtext=text='${escapeFFmpegText(script.title)}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h/2-30:enable='between(t,0,3)'`;

  const sectionFilters = script.sections.map((section, i) => {
    const startTime = script.sections.slice(0, i).reduce((acc, s) => acc + s.durationSeconds, 0);
    return `drawtext=text='${escapeFFmpegText(section.heading)}':fontsize=32:fontcolor=white:x=50:y=50:enable='between(t,${startTime},${startTime + 2})'`;
  });

  return [titleFilter, ...sectionFilters].join(",");
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export async function assembleVideo(
  script: YouTubeScript,
  segments: readonly AudioSegment[],
): Promise<VideoOutput> {
  const date = script.digest.date;
  const outputDir = join(await ensureOutputDir(), date);
  await mkdir(outputDir, { recursive: true });

  logger.info(`Assembling video in ${outputDir}`);

  const audioPaths = await writeAudioSegments(outputDir, segments);
  const fullAudioPath = await concatenateAudio(outputDir, audioPaths);

  const totalDuration = segments.reduce((acc, s) => acc + s.durationEstimate, 0);
  const videoPath = join(outputDir, "output.mp4");

  const textFilter = buildTextOverlayFilter(script);

  const ffmpegArgs = [
    "ffmpeg",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1a1a2e:s=1920x1080:d=${totalDuration}`,
    "-i",
    fullAudioPath,
    "-vf",
    textFilter,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    videoPath,
  ];

  const result = Bun.spawn(ffmpegArgs);
  const exitCode = await result.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(result.stderr).text();
    throw new Error(`FFmpeg video assembly failed (exit ${exitCode}): ${stderr}`);
  }

  logger.info(`Video assembled: ${videoPath} (${totalDuration}s)`);

  return {
    videoPath,
    duration: totalDuration,
    segments,
  };
}
