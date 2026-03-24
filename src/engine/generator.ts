import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config/index.ts";
import type { ArticleDigest, GeneratedContent } from "../types/index.ts";
import { createLogger } from "../utils/index.ts";
import { generateNewsletter } from "./newsletter.ts";
import { generateThread } from "./twitter.ts";
import { generateScript } from "./youtube.ts";

const logger = createLogger("generator");

async function safeGenerate<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    logger.error(`${label} generation failed`, { error });
    return { ok: false, error };
  }
}

export async function generateAllContent(
  config: Config,
  digest: ArticleDigest,
): Promise<GeneratedContent> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  logger.info("Starting parallel content generation", { date: digest.date });

  const [newsletterResult, twitterResult, youtubeResult] = await Promise.all([
    safeGenerate(() => generateNewsletter(client, config, digest), "newsletter"),
    safeGenerate(() => generateThread(client, config, digest), "twitter"),
    safeGenerate(() => generateScript(client, config, digest), "youtube"),
  ]);

  const failed: string[] = [];
  if (!newsletterResult.ok) failed.push("newsletter");
  if (!twitterResult.ok) failed.push("twitter");
  if (!youtubeResult.ok) failed.push("youtube");

  if (failed.length === 3) {
    throw new Error(`All content generation failed: ${failed.join(", ")}`);
  }

  if (failed.length > 0) {
    logger.warn("Some content generation failed", { failed });
  }

  if (!newsletterResult.ok || !twitterResult.ok || !youtubeResult.ok) {
    throw new Error(
      `Content generation partially failed: ${failed.join(", ")}. Cannot return complete GeneratedContent.`,
    );
  }

  const result: GeneratedContent = {
    newsletter: newsletterResult.value,
    twitter: twitterResult.value,
    youtube: youtubeResult.value,
    generatedAt: new Date(),
  };

  logger.info("Content generation complete", { date: digest.date });

  return result;
}
