import type Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Config } from "../config/index.ts";
import type { ArticleDigest, ScriptSection, YouTubeScript } from "../types/index.ts";
import { createLogger, withRetry } from "../utils/index.ts";
import { buildYouTubePrompt, YOUTUBE_SYSTEM_PROMPT } from "./prompts.ts";

const logger = createLogger("youtube");

const SECTION_SCHEMA = {
  type: "object" as const,
  properties: {
    timestamp: { type: "string" as const },
    heading: { type: "string" as const },
    narration: { type: "string" as const },
    visualNotes: { type: "string" as const },
    durationSeconds: { type: "number" as const },
  },
  required: ["timestamp", "heading", "narration", "visualNotes", "durationSeconds"] as const,
  additionalProperties: false,
};

const YOUTUBE_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const },
    description: { type: "string" as const },
    tags: {
      type: "array" as const,
      items: { type: "string" as const },
      minItems: 5,
      maxItems: 15,
    },
    sections: {
      type: "array" as const,
      items: SECTION_SCHEMA,
      minItems: 3,
      maxItems: 10,
    },
  },
  required: ["title", "description", "tags", "sections"] as const,
  additionalProperties: false,
};

type YouTubeOutput = {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly sections: readonly {
    readonly timestamp: string;
    readonly heading: string;
    readonly narration: string;
    readonly visualNotes: string;
    readonly durationSeconds: number;
  }[];
};

export async function generateScript(
  client: Anthropic,
  config: Config,
  digest: ArticleDigest,
): Promise<YouTubeScript> {
  const { youtubeChannelName, twitterHandle } = config.content;
  const prompt = buildYouTubePrompt(digest, youtubeChannelName, twitterHandle);

  logger.info("Generating YouTube script", {
    date: digest.date,
    stories: digest.topStories.length,
  });

  const output = await withRetry(
    () =>
      client.messages.parse({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: YOUTUBE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: jsonSchemaOutputFormat(YOUTUBE_SCHEMA),
        },
      }),
    "generateScript",
    { maxRetries: 2, delayMs: 2000 },
  );

  const parsed = output.parsed_output as YouTubeOutput | null;

  if (!parsed) {
    throw new Error("YouTube script generation returned null parsed output");
  }

  const sections: readonly ScriptSection[] = parsed.sections.map((s) => ({
    timestamp: s.timestamp,
    heading: s.heading,
    narration: s.narration,
    visualNotes: s.visualNotes,
    durationSeconds: s.durationSeconds,
  }));

  const totalDurationEstimate = sections.reduce((sum, s) => sum + s.durationSeconds, 0);

  logger.info("YouTube script generated", {
    title: parsed.title,
    sections: sections.length,
    durationSeconds: totalDurationEstimate,
  });

  return {
    title: parsed.title,
    description: parsed.description,
    tags: parsed.tags,
    sections,
    totalDurationEstimate,
    digest,
    generatedAt: new Date(),
  };
}
