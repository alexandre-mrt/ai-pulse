import type Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Config } from "../config/index.ts";
import type { ArticleDigest, NewsletterContent } from "../types/index.ts";
import { createLogger, withRetry } from "../utils/index.ts";
import { buildNewsletterPrompt, NEWSLETTER_SYSTEM_PROMPT } from "./prompts.ts";

const logger = createLogger("newsletter");

const NEWSLETTER_SCHEMA = {
  type: "object" as const,
  properties: {
    subject: { type: "string" as const },
    previewText: { type: "string" as const },
    htmlBody: { type: "string" as const },
    plainTextBody: { type: "string" as const },
  },
  required: ["subject", "previewText", "htmlBody", "plainTextBody"] as const,
  additionalProperties: false,
};

type NewsletterOutput = {
  readonly subject: string;
  readonly previewText: string;
  readonly htmlBody: string;
  readonly plainTextBody: string;
};

export async function generateNewsletter(
  client: Anthropic,
  config: Config,
  digest: ArticleDigest,
): Promise<NewsletterContent> {
  const { newsletterName } = config.content;
  const prompt = buildNewsletterPrompt(digest, newsletterName);

  logger.info("Generating newsletter", { date: digest.date, stories: digest.topStories.length });

  const output = await withRetry(
    () =>
      client.messages.parse({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: NEWSLETTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: jsonSchemaOutputFormat(NEWSLETTER_SCHEMA),
        },
      }),
    "generateNewsletter",
    { maxRetries: 2, delayMs: 2000 },
  );

  const parsed = output.parsed_output as NewsletterOutput | null;

  if (!parsed) {
    throw new Error("Newsletter generation returned null parsed output");
  }

  logger.info("Newsletter generated", { subject: parsed.subject });

  return {
    subject: parsed.subject,
    previewText: parsed.previewText,
    htmlBody: parsed.htmlBody,
    plainTextBody: parsed.plainTextBody,
    digest,
    generatedAt: new Date(),
  };
}
