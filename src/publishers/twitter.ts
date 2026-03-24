import crypto from "node:crypto";
import type { Config } from "../config/index.ts";
import type { TwitterThread } from "../types/index.ts";
import { createLogger, withRetry } from "../utils/index.ts";

const logger = createLogger("publisher:twitter");

const TWITTER_API_BASE = "https://api.twitter.com/2";

interface TweetResponse {
  readonly data: {
    readonly id: string;
    readonly text: string;
  };
}

function generateOAuthNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateOAuthTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
    .join("&");

  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  const hmac = crypto.createHmac("sha1", signingKey);
  hmac.update(signatureBase);
  return hmac.digest("base64");
}

function buildOAuthHeader(config: Config, method: string, url: string): string {
  const nonce = generateOAuthNonce();
  const timestamp = generateOAuthTimestamp();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.twitter.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: config.twitter.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    config.twitter.apiSecret,
    config.twitter.accessTokenSecret,
  );

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key] ?? "")}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

async function postTweet(config: Config, text: string, replyToId?: string): Promise<TweetResponse> {
  const url = `${TWITTER_API_BASE}/tweets`;
  const authHeader = buildOAuthHeader(config, "POST", url);

  const body: Record<string, unknown> = { text };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Twitter API error ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<TweetResponse>;
}

export async function publishThread(
  config: Config,
  thread: TwitterThread,
): Promise<{ readonly tweetIds: readonly string[]; readonly firstTweetUrl: string }> {
  logger.info(`Publishing Twitter thread with ${thread.tweets.length} tweets`);

  const tweetIds: string[] = [];
  let previousTweetId: string | undefined;

  for (const tweet of thread.tweets) {
    const result = await withRetry(
      () => postTweet(config, tweet.text, previousTweetId),
      `twitter:tweet-${tweetIds.length + 1}`,
      { maxRetries: 2, delayMs: 5000 },
    );

    tweetIds.push(result.data.id);
    previousTweetId = result.data.id;

    logger.info(`Published tweet ${tweetIds.length}/${thread.tweets.length}: ${result.data.id}`);

    if (tweetIds.length < thread.tweets.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  const firstTweetId = tweetIds[0];
  const firstTweetUrl = firstTweetId ? `https://twitter.com/i/web/status/${firstTweetId}` : "";

  logger.info(`Thread published: ${tweetIds.length} tweets`, { firstTweetUrl });

  return { tweetIds, firstTweetUrl };
}
