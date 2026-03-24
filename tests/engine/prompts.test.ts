import { describe, expect, test } from "bun:test";
import {
  NEWSLETTER_SYSTEM_PROMPT,
  TWITTER_SYSTEM_PROMPT,
  YOUTUBE_SYSTEM_PROMPT,
  buildNewsletterPrompt,
  buildTwitterPrompt,
  buildYouTubePrompt,
} from "../../src/engine/prompts.ts";
import type { ArticleDigest, ScoredArticle } from "../../src/types/index.ts";

function makeScoredArticle(overrides: Partial<ScoredArticle> = {}): ScoredArticle {
  return {
    sourceId: "hn-123",
    source: "hackernews",
    title: "New GPT Model Released",
    url: "https://example.com/news",
    summary: "A new large language model was released today with improved capabilities.",
    author: "author",
    publishedAt: new Date("2025-01-01T10:00:00Z"),
    score: 100,
    tags: ["ai", "llm"],
    metadata: {},
    relevanceScore: 0.9,
    trendingScore: 0.8,
    combinedScore: 0.85,
    ...overrides,
  };
}

function makeDigest(overrides: Partial<ArticleDigest> = {}): ArticleDigest {
  const article = makeScoredArticle();
  return {
    date: "2025-01-01",
    articles: [article],
    topStories: [article],
    fetchedAt: new Date("2025-01-01T12:00:00Z"),
    sourceStats: {
      hackernews: 1,
      reddit: 0,
      techcrunch: 0,
      arxiv: 0,
      producthunt: 0,
      rss: 0,
    },
    ...overrides,
  };
}

describe("system prompts", () => {
  test("NEWSLETTER_SYSTEM_PROMPT is non-empty", () => {
    expect(NEWSLETTER_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });

  test("TWITTER_SYSTEM_PROMPT is non-empty", () => {
    expect(TWITTER_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });

  test("YOUTUBE_SYSTEM_PROMPT is non-empty", () => {
    expect(YOUTUBE_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });
});

describe("buildNewsletterPrompt", () => {
  test("returns a non-empty string", () => {
    const digest = makeDigest();
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(typeof result).toBe("string");
    expect(result.trim().length).toBeGreaterThan(0);
  });

  test("includes the newsletter name", () => {
    const digest = makeDigest();
    const result = buildNewsletterPrompt(digest, "My Newsletter");
    expect(result).toContain("My Newsletter");
  });

  test("includes the digest date", () => {
    const digest = makeDigest({ date: "2025-06-15" });
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(result).toContain("2025-06-15");
  });

  test("includes article title from digest", () => {
    const article = makeScoredArticle({ title: "Unique Article Title XYZ" });
    const digest = makeDigest({ articles: [article], topStories: [article] });
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(result).toContain("Unique Article Title XYZ");
  });

  test("includes article URL from digest", () => {
    const article = makeScoredArticle({ url: "https://unique-url.test/article" });
    const digest = makeDigest({ articles: [article], topStories: [article] });
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(result).toContain("https://unique-url.test/article");
  });

  test("truncates long summaries to 300 chars plus ellipsis", () => {
    const longSummary = "x".repeat(400);
    const article = makeScoredArticle({ summary: longSummary });
    const digest = makeDigest({ articles: [article], topStories: [article] });
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(result).toContain("x".repeat(300) + "...");
    expect(result).not.toContain("x".repeat(301) + "x");
  });

  test("works with empty topStories", () => {
    const article = makeScoredArticle();
    const digest = makeDigest({ articles: [article], topStories: [] });
    const result = buildNewsletterPrompt(digest, "AI Pulse");
    expect(typeof result).toBe("string");
    expect(result.trim().length).toBeGreaterThan(0);
  });
});

describe("buildTwitterPrompt", () => {
  test("returns a non-empty string", () => {
    const digest = makeDigest();
    const result = buildTwitterPrompt(digest, "@ai_pulse", "AI Pulse");
    expect(typeof result).toBe("string");
    expect(result.trim().length).toBeGreaterThan(0);
  });

  test("includes the twitter handle", () => {
    const digest = makeDigest();
    const result = buildTwitterPrompt(digest, "@my_handle", "AI Pulse");
    expect(result).toContain("@my_handle");
  });

  test("includes the newsletter name", () => {
    const digest = makeDigest();
    const result = buildTwitterPrompt(digest, "@ai_pulse", "Tech Weekly");
    expect(result).toContain("Tech Weekly");
  });

  test("includes the digest date", () => {
    const digest = makeDigest({ date: "2025-09-20" });
    const result = buildTwitterPrompt(digest, "@ai_pulse", "AI Pulse");
    expect(result).toContain("2025-09-20");
  });

  test("includes article title from top stories", () => {
    const article = makeScoredArticle({ title: "Exclusive Twitter Story ABC" });
    const digest = makeDigest({ articles: [article], topStories: [article] });
    const result = buildTwitterPrompt(digest, "@ai_pulse", "AI Pulse");
    expect(result).toContain("Exclusive Twitter Story ABC");
  });
});

describe("buildYouTubePrompt", () => {
  test("returns a non-empty string", () => {
    const digest = makeDigest();
    const result = buildYouTubePrompt(digest, "AI Pulse Channel", "@ai_pulse");
    expect(typeof result).toBe("string");
    expect(result.trim().length).toBeGreaterThan(0);
  });

  test("includes the channel name", () => {
    const digest = makeDigest();
    const result = buildYouTubePrompt(digest, "Tech Insights Channel", "@ai_pulse");
    expect(result).toContain("Tech Insights Channel");
  });

  test("includes the twitter handle", () => {
    const digest = makeDigest();
    const result = buildYouTubePrompt(digest, "AI Pulse", "@tech_daily");
    expect(result).toContain("@tech_daily");
  });

  test("includes the digest date", () => {
    const digest = makeDigest({ date: "2025-12-31" });
    const result = buildYouTubePrompt(digest, "AI Pulse", "@ai_pulse");
    expect(result).toContain("2025-12-31");
  });

  test("includes article title from top stories", () => {
    const article = makeScoredArticle({ title: "YouTube Exclusive Story DEF" });
    const digest = makeDigest({ articles: [article], topStories: [article] });
    const result = buildYouTubePrompt(digest, "AI Pulse", "@ai_pulse");
    expect(result).toContain("YouTube Exclusive Story DEF");
  });
});
