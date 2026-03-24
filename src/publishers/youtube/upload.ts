import type { Config } from "../../config/index.ts";
import type { YouTubeScript } from "../../types/index.ts";
import { createLogger, withRetry } from "../../utils/index.ts";

const logger = createLogger("publisher:youtube:upload");

const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface YouTubeUploadResult {
  readonly videoId: string;
  readonly url: string;
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: string;
}

interface YouTubeVideoResponse {
  readonly id: string;
  readonly snippet: {
    readonly title: string;
    readonly publishedAt: string;
  };
}

async function getAccessToken(config: Config): Promise<string> {
  logger.debug("Refreshing YouTube access token");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.youtube.clientId,
      client_secret: config.youtube.clientSecret,
      refresh_token: config.youtube.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh YouTube token: ${response.status} ${errorBody}`);
  }

  const tokenData = (await response.json()) as TokenResponse;
  return tokenData.access_token;
}

function buildVideoMetadata(script: YouTubeScript): Record<string, unknown> {
  return {
    snippet: {
      title: script.title,
      description: script.description,
      tags: script.tags,
      categoryId: "28",
      defaultLanguage: "en",
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
  };
}

export async function uploadVideo(
  config: Config,
  script: YouTubeScript,
  videoPath: string,
): Promise<YouTubeUploadResult> {
  logger.info(`Uploading video to YouTube: ${script.title}`);

  const accessToken = await getAccessToken(config);
  const metadata = buildVideoMetadata(script);
  const videoData = Buffer.from(await Bun.file(videoPath).arrayBuffer());

  const boundary = `boundary_${Date.now()}`;
  const metadataJson = JSON.stringify(metadata);

  const bodyParts = [
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    metadataJson,
    `\r\n--${boundary}\r\n`,
    "Content-Type: video/mp4\r\n\r\n",
  ];

  const textEncoder = new TextEncoder();
  const headerBytes = textEncoder.encode(bodyParts.join(""));
  const footerBytes = textEncoder.encode(`\r\n--${boundary}--`);

  const body = Buffer.concat([Buffer.from(headerBytes), videoData, Buffer.from(footerBytes)]);

  const result = await withRetry(
    async () => {
      const response = await fetch(
        `${YOUTUBE_UPLOAD_URL}?uploadType=multipart&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": body.length.toString(),
          },
          body,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`YouTube upload failed: ${response.status} ${errorBody}`);
      }

      return response.json() as Promise<YouTubeVideoResponse>;
    },
    "youtube:upload",
    { maxRetries: 2, delayMs: 10000 },
  );

  const url = `https://www.youtube.com/watch?v=${result.id}`;
  logger.info(`Video uploaded: ${url}`);

  return { videoId: result.id, url };
}
