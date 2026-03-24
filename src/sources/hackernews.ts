import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchJson, withRetry } from "../utils/index.ts";

const logger = createLogger("hackernews");

const HN_BASE_URL = "https://hacker-news.firebaseio.com/v0";
const RATE_LIMIT = { requestsPerSecond: 2 };
const MIN_SCORE_THRESHOLD = 10;

const AI_TECH_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "gpt",
  "neural",
  "ml",
  "openai",
  "anthropic",
  "gemini",
  "model",
  "transformer",
  "nlp",
  "computer vision",
  "robotics",
  "automation",
  "algorithm",
  "data science",
  "tech",
  "software",
  "programming",
  "developer",
  "open source",
  "startup",
  "cloud",
  "api",
  "framework",
] as const;

interface HNStory {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
  readonly score: number;
  readonly by: string;
  readonly time: number;
  readonly type: string;
  readonly descendants?: number;
}

function isAiTechRelated(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return AI_TECH_KEYWORDS.some((keyword) => lowerTitle.includes(keyword));
}

function buildArticleUrl(story: HNStory): string {
  return story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
}

function storyToRawArticle(story: HNStory): RawArticle {
  return {
    sourceId: String(story.id),
    source: "hackernews",
    title: story.title,
    url: buildArticleUrl(story),
    summary: "",
    author: story.by || null,
    publishedAt: new Date(story.time * 1000),
    score: story.score,
    tags: [],
    metadata: {
      hnId: story.id,
      comments: story.descendants ?? 0,
      originalUrl: story.url ?? null,
    },
  };
}

async function fetchTopIds(): Promise<readonly number[]> {
  return withRetry(
    () =>
      fetchJson<number[]>(`${HN_BASE_URL}/topstories.json`, {
        rateLimit: RATE_LIMIT,
      }),
    "hackernews:topstories",
  );
}

async function fetchStory(id: number): Promise<HNStory | null> {
  try {
    const story = await withRetry(
      () =>
        fetchJson<HNStory>(`${HN_BASE_URL}/item/${id}.json`, {
          rateLimit: RATE_LIMIT,
        }),
      `hackernews:item:${id}`,
      { maxRetries: 2 },
    );
    return story;
  } catch (error) {
    logger.warn(`Failed to fetch story ${id}`, { error });
    return null;
  }
}

function isValidStory(story: HNStory | null): story is HNStory {
  return (
    story !== null &&
    story.type === "story" &&
    story.score > MIN_SCORE_THRESHOLD &&
    isAiTechRelated(story.title)
  );
}

export class HackerNewsProvider implements SourceProvider {
  readonly name = "hackernews" as const;
  private readonly maxArticles: number;

  constructor(maxArticles: number) {
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    logger.info("Fetching HackerNews top stories");

    const allIds = await fetchTopIds();
    const candidateIds = allIds.slice(0, this.maxArticles * 3);

    logger.debug(`Fetching ${candidateIds.length} story candidates`);

    const stories = await Promise.all(candidateIds.map(fetchStory));
    const validStories = stories.filter(isValidStory).slice(0, this.maxArticles);

    logger.info(`Fetched ${validStories.length} HackerNews articles`);

    return validStories.map(storyToRawArticle);
  }
}
