import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadConfig } from "../../src/config/index.ts";

const REQUIRED_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "BEEHIIV_API_KEY",
  "BEEHIIV_PUBLICATION_ID",
  "TWITTER_API_KEY",
  "TWITTER_API_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_TOKEN_SECRET",
  "ELEVENLABS_API_KEY",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "PRODUCTHUNT_ACCESS_TOKEN",
] as const;

const FULL_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  BEEHIIV_API_KEY: "bh-test-key",
  BEEHIIV_PUBLICATION_ID: "pub-test-id",
  TWITTER_API_KEY: "tw-key",
  TWITTER_API_SECRET: "tw-secret",
  TWITTER_ACCESS_TOKEN: "tw-token",
  TWITTER_ACCESS_TOKEN_SECRET: "tw-token-secret",
  ELEVENLABS_API_KEY: "el-test-key",
  YOUTUBE_CLIENT_ID: "yt-client-id",
  YOUTUBE_CLIENT_SECRET: "yt-client-secret",
  YOUTUBE_REFRESH_TOKEN: "yt-refresh",
  REDDIT_CLIENT_ID: "rd-client-id",
  REDDIT_CLIENT_SECRET: "rd-client-secret",
  PRODUCTHUNT_ACCESS_TOKEN: "ph-token",
};

let savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
}

function clearEnv(keys: readonly string[]): void {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv = {};
}

beforeEach(() => {
  savedEnv = {};
});

afterEach(() => {
  restoreEnv();
});

describe("loadConfig — required env vars", () => {
  test("succeeds when all required env vars are present", () => {
    setEnv(FULL_ENV);
    expect(() => loadConfig()).not.toThrow();
  });

  for (const varName of REQUIRED_ENV_VARS) {
    test(`throws when ${varName} is missing`, () => {
      setEnv(FULL_ENV);
      delete process.env[varName];
      expect(() => loadConfig()).toThrow(varName);
    });
  }
});

describe("loadConfig — optional vars use defaults", () => {
  beforeEach(() => {
    setEnv(FULL_ENV);
    clearEnv([
      "ANTHROPIC_MODEL",
      "ANTHROPIC_MAX_TOKENS",
      "ELEVENLABS_VOICE_ID",
      "ELEVENLABS_MODEL",
      "REDDIT_USER_AGENT",
      "PIPELINE_CRON",
      "PIPELINE_TIMEZONE",
      "PIPELINE_MAX_RETRIES",
      "PIPELINE_RETRY_DELAY_MS",
      "DB_PATH",
      "CONTENT_NEWSLETTER_NAME",
      "CONTENT_TWITTER_HANDLE",
      "CONTENT_YOUTUBE_CHANNEL",
      "CONTENT_TOP_STORIES",
      "CONTENT_MAX_ARTICLES",
    ]);
  });

  test("uses default Anthropic model", () => {
    const config = loadConfig();
    expect(config.anthropic.model).toBe("claude-sonnet-4-5-20250929");
  });

  test("uses default Anthropic maxTokens of 4096", () => {
    const config = loadConfig();
    expect(config.anthropic.maxTokens).toBe(4096);
  });

  test("uses default ElevenLabs voiceId", () => {
    const config = loadConfig();
    expect(config.elevenlabs.voiceId).toBe("JBFqnCBsd6RMkjVDRZzb");
  });

  test("uses default ElevenLabs model", () => {
    const config = loadConfig();
    expect(config.elevenlabs.model).toBe("eleven_multilingual_v2");
  });

  test("uses default pipeline cron schedule", () => {
    const config = loadConfig();
    expect(config.pipeline.cronSchedule).toBe("0 7 * * *");
  });

  test("uses default pipeline timezone", () => {
    const config = loadConfig();
    expect(config.pipeline.timezone).toBe("America/New_York");
  });

  test("uses default pipeline maxRetries of 3", () => {
    const config = loadConfig();
    expect(config.pipeline.maxRetries).toBe(3);
  });

  test("uses default pipeline retryDelayMs of 5000", () => {
    const config = loadConfig();
    expect(config.pipeline.retryDelayMs).toBe(5000);
  });

  test("uses default db path", () => {
    const config = loadConfig();
    expect(config.storage.dbPath).toBe("./data/ai-pulse.db");
  });

  test("uses default newsletter name", () => {
    const config = loadConfig();
    expect(config.content.newsletterName).toBe("AI Pulse");
  });

  test("uses default twitter handle", () => {
    const config = loadConfig();
    expect(config.content.twitterHandle).toBe("@ai_pulse_daily");
  });

  test("uses default youtube channel name", () => {
    const config = loadConfig();
    expect(config.content.youtubeChannelName).toBe("AI Pulse");
  });

  test("uses default topStoriesCount of 5", () => {
    const config = loadConfig();
    expect(config.content.topStoriesCount).toBe(5);
  });

  test("uses default maxArticlesPerDigest of 20", () => {
    const config = loadConfig();
    expect(config.content.maxArticlesPerDigest).toBe(20);
  });
});

describe("loadConfig — numeric parsing", () => {
  beforeEach(() => setEnv(FULL_ENV));

  test("parses ANTHROPIC_MAX_TOKENS as number", () => {
    process.env.ANTHROPIC_MAX_TOKENS = "8192";
    const config = loadConfig();
    expect(config.anthropic.maxTokens).toBe(8192);
    expect(typeof config.anthropic.maxTokens).toBe("number");
  });

  test("parses PIPELINE_MAX_RETRIES as number", () => {
    process.env.PIPELINE_MAX_RETRIES = "5";
    const config = loadConfig();
    expect(config.pipeline.maxRetries).toBe(5);
    expect(typeof config.pipeline.maxRetries).toBe("number");
  });

  test("parses PIPELINE_RETRY_DELAY_MS as number", () => {
    process.env.PIPELINE_RETRY_DELAY_MS = "10000";
    const config = loadConfig();
    expect(config.pipeline.retryDelayMs).toBe(10000);
    expect(typeof config.pipeline.retryDelayMs).toBe("number");
  });

  test("parses CONTENT_TOP_STORIES as number", () => {
    process.env.CONTENT_TOP_STORIES = "7";
    const config = loadConfig();
    expect(config.content.topStoriesCount).toBe(7);
    expect(typeof config.content.topStoriesCount).toBe("number");
  });

  test("parses CONTENT_MAX_ARTICLES as number", () => {
    process.env.CONTENT_MAX_ARTICLES = "50";
    const config = loadConfig();
    expect(config.content.maxArticlesPerDigest).toBe(50);
    expect(typeof config.content.maxArticlesPerDigest).toBe("number");
  });
});

describe("loadConfig — values are picked up from env", () => {
  test("uses provided API key for anthropic", () => {
    setEnv({ ...FULL_ENV, ANTHROPIC_API_KEY: "custom-key-xyz" });
    const config = loadConfig();
    expect(config.anthropic.apiKey).toBe("custom-key-xyz");
  });

  test("uses provided beehiiv publication id", () => {
    setEnv({ ...FULL_ENV, BEEHIIV_PUBLICATION_ID: "my-pub-99" });
    const config = loadConfig();
    expect(config.beehiiv.publicationId).toBe("my-pub-99");
  });
});
