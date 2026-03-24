import type Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Config } from "../config/index.ts";
import type { ArticleDigest, Tweet, TwitterThread } from "../types/index.ts";
import { createLogger, withRetry } from "../utils/index.ts";
import { buildTwitterPrompt, TWITTER_SYSTEM_PROMPT } from "./prompts.ts";

const logger = createLogger("twitter");

const TWEET_SCHEMA = {
  type: "object" as const,
  properties: {
    text: { type: "string" as const },
  },
  required: ["text"] as const,
  additionalProperties: false,
};

const THREAD_SCHEMA = {
  type: "object" as const,
  properties: {
    tweets: {
      type: "array" as const,
      items: TWEET_SCHEMA,
      minItems: 5,
      maxItems: 10,
    },
  },
  required: ["tweets"] as const,
  additionalProperties: false,
};

type ThreadOutput = {
  readonly tweets: readonly { readonly text: string }[];
};

const MAX_TWEET_LENGTH = 280;

function validateTweetLength(tweet: Tweet, index: number): void {
  if (tweet.text.length > MAX_TWEET_LENGTH) {
    logger.warn(`Tweet ${index + 1} exceeds ${MAX_TWEET_LENGTH} chars`, {
      length: tweet.text.length,
      preview: tweet.text.slice(0, 50),
    });
  }
}

export async function generateThread(
  client: Anthropic,
  config: Config,
  digest: ArticleDigest,
): Promise<TwitterThread> {
  const { twitterHandle, newsletterName } = config.content;
  const prompt = buildTwitterPrompt(digest, twitterHandle, newsletterName);

  logger.info("Generating Twitter thread", {
    date: digest.date,
    stories: digest.topStories.length,
  });

  const output = await withRetry(
    () =>
      client.messages.parse({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: TWITTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: jsonSchemaOutputFormat(THREAD_SCHEMA),
        },
      }),
    "generateThread",
    { maxRetries: 2, delayMs: 2000 },
  );

  const parsed = output.parsed_output as ThreadOutput | null;

  if (!parsed) {
    throw new Error("Twitter thread generation returned null parsed output");
  }

  const tweets: readonly Tweet[] = parsed.tweets.map((t) => ({
    text: t.text,
    mediaUrls: [] as readonly string[],
  }));

  tweets.forEach(validateTweetLength);

  logger.info("Twitter thread generated", { tweetCount: tweets.length });

  return {
    tweets,
    digest,
    generatedAt: new Date(),
  };
}
