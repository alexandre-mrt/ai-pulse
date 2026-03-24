import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config/index.ts";
import type { ArticleDigest, GeneratedContent } from "../types/index.ts";
import { createLogger } from "../utils/index.ts";
import { generateNewsletter } from "./newsletter.ts";
import { generateThread } from "./twitter.ts";
import { generateScript } from "./youtube.ts";

const logger = createLogger("generator");

export async function generateAllContent(
  config: Config,
  digest: ArticleDigest,
): Promise<GeneratedContent> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  logger.info("Starting parallel content generation", { date: digest.date });

  const [newsletter, twitter, youtube] = await Promise.all([
    generateNewsletter(client, config, digest),
    generateThread(client, config, digest),
    generateScript(client, config, digest),
  ]);

  logger.info("Content generation complete", { date: digest.date });

  return {
    newsletter,
    twitter,
    youtube,
    generatedAt: new Date(),
  };
}
