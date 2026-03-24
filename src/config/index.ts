import type { SourceName } from "../types";

interface SourceConfig {
  readonly enabled: boolean;
  readonly maxArticles: number;
}

interface Config {
  readonly anthropic: {
    readonly apiKey: string;
    readonly model: string;
    readonly maxTokens: number;
  };
  readonly beehiiv: {
    readonly apiKey: string;
    readonly publicationId: string;
  };
  readonly twitter: {
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly accessToken: string;
    readonly accessTokenSecret: string;
  };
  readonly elevenlabs: {
    readonly apiKey: string;
    readonly voiceId: string;
    readonly model: string;
  };
  readonly youtube: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly refreshToken: string;
  };
  readonly reddit: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly userAgent: string;
  };
  readonly producthunt: {
    readonly accessToken: string;
  };
  readonly sources: Readonly<Record<SourceName, SourceConfig>>;
  readonly pipeline: {
    readonly cronSchedule: string;
    readonly timezone: string;
    readonly maxRetries: number;
    readonly retryDelayMs: number;
  };
  readonly storage: {
    readonly dbPath: string;
  };
  readonly content: {
    readonly newsletterName: string;
    readonly twitterHandle: string;
    readonly youtubeChannelName: string;
    readonly topStoriesCount: number;
    readonly maxArticlesPerDigest: number;
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function conditionalRequireEnv(key: string, condition: boolean): string {
  if (!condition) return "";
  return requireEnv(key);
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function numericEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  const sources = {
    hackernews: {
      enabled: optionalEnv("SOURCE_HACKERNEWS_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_HACKERNEWS_MAX", 30),
    },
    reddit: {
      enabled: optionalEnv("SOURCE_REDDIT_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_REDDIT_MAX", 20),
    },
    techcrunch: {
      enabled: optionalEnv("SOURCE_TECHCRUNCH_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_TECHCRUNCH_MAX", 15),
    },
    arxiv: {
      enabled: optionalEnv("SOURCE_ARXIV_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_ARXIV_MAX", 10),
    },
    producthunt: {
      enabled: optionalEnv("SOURCE_PRODUCTHUNT_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_PRODUCTHUNT_MAX", 10),
    },
    rss: {
      enabled: optionalEnv("SOURCE_RSS_ENABLED", "true") === "true",
      maxArticles: numericEnv("SOURCE_RSS_MAX", 15),
    },
  } as const;

  return {
    anthropic: {
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
      model: optionalEnv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
      maxTokens: numericEnv("ANTHROPIC_MAX_TOKENS", 4096),
    },
    beehiiv: {
      apiKey: requireEnv("BEEHIIV_API_KEY"),
      publicationId: requireEnv("BEEHIIV_PUBLICATION_ID"),
    },
    twitter: {
      apiKey: requireEnv("TWITTER_API_KEY"),
      apiSecret: requireEnv("TWITTER_API_SECRET"),
      accessToken: requireEnv("TWITTER_ACCESS_TOKEN"),
      accessTokenSecret: requireEnv("TWITTER_ACCESS_TOKEN_SECRET"),
    },
    elevenlabs: {
      apiKey: requireEnv("ELEVENLABS_API_KEY"),
      voiceId: optionalEnv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb"),
      model: optionalEnv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
    },
    youtube: {
      clientId: requireEnv("YOUTUBE_CLIENT_ID"),
      clientSecret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      refreshToken: requireEnv("YOUTUBE_REFRESH_TOKEN"),
    },
    reddit: {
      clientId: conditionalRequireEnv("REDDIT_CLIENT_ID", sources.reddit.enabled),
      clientSecret: conditionalRequireEnv("REDDIT_CLIENT_SECRET", sources.reddit.enabled),
      userAgent: optionalEnv("REDDIT_USER_AGENT", "ai-pulse:v1.0.0 (by /u/ai-pulse-bot)"),
    },
    producthunt: {
      accessToken: conditionalRequireEnv("PRODUCTHUNT_ACCESS_TOKEN", sources.producthunt.enabled),
    },
    sources,
    pipeline: {
      cronSchedule: optionalEnv("PIPELINE_CRON", "0 7 * * *"),
      timezone: optionalEnv("PIPELINE_TIMEZONE", "America/New_York"),
      maxRetries: numericEnv("PIPELINE_MAX_RETRIES", 3),
      retryDelayMs: numericEnv("PIPELINE_RETRY_DELAY_MS", 5000),
    },
    storage: {
      dbPath: optionalEnv("DB_PATH", "./data/ai-pulse.db"),
    },
    content: {
      newsletterName: optionalEnv("CONTENT_NEWSLETTER_NAME", "AI Pulse"),
      twitterHandle: optionalEnv("CONTENT_TWITTER_HANDLE", "@ai_pulse_daily"),
      youtubeChannelName: optionalEnv("CONTENT_YOUTUBE_CHANNEL", "AI Pulse"),
      topStoriesCount: numericEnv("CONTENT_TOP_STORIES", 5),
      maxArticlesPerDigest: numericEnv("CONTENT_MAX_ARTICLES", 20),
    },
  };
}

export type { Config };
