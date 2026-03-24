import type { Database } from "bun:sqlite";
import type { Config } from "../config/index.ts";
import { getDatabase } from "../storage/database.ts";
import type { ArticleDigest, RawArticle, ScoredArticle, SourceName } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger } from "../utils/index.ts";
import { ArxivProvider } from "./arxiv.ts";
import { HackerNewsProvider } from "./hackernews.ts";
import { ProductHuntProvider } from "./producthunt.ts";
import { RedditProvider } from "./reddit.ts";
import { RssProvider } from "./rss.ts";
import { TechCrunchProvider } from "./techcrunch.ts";

const logger = createLogger("aggregator");

const RELEVANCE_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "large language model",
  "gpt",
  "openai",
  "anthropic",
  "gemini",
  "neural network",
  "transformer",
  "nlp",
  "natural language",
  "computer vision",
  "robotics",
  "automation",
  "generative ai",
  "foundation model",
  "reinforcement learning",
] as const;

const TRENDING_SCORE_WEIGHTS: Readonly<Record<SourceName, number>> = {
  hackernews: 1.0,
  reddit: 0.8,
  techcrunch: 0.5,
  arxiv: 0.3,
  producthunt: 0.9,
  rss: 0.4,
};

function computeRelevanceScore(article: RawArticle): number {
  const text = `${article.title} ${article.summary} ${article.tags.join(" ")}`.toLowerCase();
  const matches = RELEVANCE_KEYWORDS.filter((kw) => text.includes(kw)).length;
  return Math.min(matches / RELEVANCE_KEYWORDS.length, 1.0);
}

function computeTrendingScore(article: RawArticle): number {
  const weight = TRENDING_SCORE_WEIGHTS[article.source] ?? 0.5;
  const normalizedScore = article.score > 0 ? Math.log1p(article.score) / Math.log1p(10000) : 0;
  return Math.min(normalizedScore * weight, 1.0);
}

function scoreArticle(article: RawArticle): ScoredArticle {
  const relevanceScore = computeRelevanceScore(article);
  const trendingScore = computeTrendingScore(article);
  const combinedScore = relevanceScore * 0.6 + trendingScore * 0.4;

  return {
    ...article,
    relevanceScore,
    trendingScore,
    combinedScore,
  };
}

function deduplicateByUrl(articles: readonly RawArticle[]): readonly RawArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}

function getRecentlyPublishedUrls(db: Database, daysBack: number): Set<string> {
  const rows = db
    .prepare(
      "SELECT DISTINCT url FROM articles WHERE published_at >= datetime('now', '-' || ? || ' days')",
    )
    .all(daysBack) as ReadonlyArray<{ url: string }>;
  return new Set(rows.map((r) => r.url));
}

function deduplicateAcrossDays(
  articles: readonly RawArticle[],
  recentUrls: Set<string>,
): readonly RawArticle[] {
  const before = articles.length;
  const filtered = articles.filter((a) => !recentUrls.has(a.url));
  const removed = before - filtered.length;
  if (removed > 0) {
    logger.info(`Cross-day dedup: removed ${removed} articles already published recently`);
  }
  return filtered;
}

function buildSourceStats(
  articles: readonly ScoredArticle[],
): Readonly<Record<SourceName, number>> {
  const counts: Record<SourceName, number> = {
    hackernews: 0,
    reddit: 0,
    techcrunch: 0,
    arxiv: 0,
    producthunt: 0,
    rss: 0,
  };

  for (const article of articles) {
    counts[article.source] = (counts[article.source] ?? 0) + 1;
  }

  return counts;
}

async function fetchFromProvider(provider: SourceProvider): Promise<readonly RawArticle[]> {
  try {
    const articles = await provider.fetch();
    logger.info(`${provider.name}: fetched ${articles.length} articles`);
    return articles;
  } catch (error) {
    logger.error(`${provider.name}: fetch failed`, { error });
    return [];
  }
}

function buildProviders(config: Config): readonly SourceProvider[] {
  const { sources, reddit, producthunt } = config;
  const providers: SourceProvider[] = [];

  if (sources.hackernews.enabled) {
    providers.push(new HackerNewsProvider(sources.hackernews.maxArticles));
  }

  if (sources.reddit.enabled) {
    providers.push(new RedditProvider(reddit, sources.reddit.maxArticles));
  }

  if (sources.techcrunch.enabled) {
    providers.push(new TechCrunchProvider(sources.techcrunch.maxArticles));
  }

  if (sources.arxiv.enabled) {
    providers.push(new ArxivProvider(sources.arxiv.maxArticles));
  }

  if (sources.producthunt.enabled) {
    providers.push(
      new ProductHuntProvider(producthunt.accessToken, sources.producthunt.maxArticles),
    );
  }

  if (sources.rss.enabled) {
    providers.push(new RssProvider(sources.rss.maxArticles));
  }

  return providers;
}

export async function createAggregator(config: Config): Promise<ArticleDigest> {
  const providers = buildProviders(config);
  logger.info(`Running ${providers.length} source providers in parallel`);

  const results = await Promise.all(providers.map(fetchFromProvider));
  const allArticles = results.flat();

  logger.info(`Total raw articles before dedup: ${allArticles.length}`);

  const withinRunDeduped = deduplicateByUrl(allArticles);

  let deduplicated: readonly RawArticle[];
  try {
    const db = getDatabase(config.storage.dbPath);
    const recentUrls = getRecentlyPublishedUrls(db, 7);
    deduplicated = deduplicateAcrossDays(withinRunDeduped, recentUrls);
  } catch {
    logger.warn("Cross-day dedup skipped (database not available)");
    deduplicated = withinRunDeduped;
  }

  logger.info(`After deduplication: ${deduplicated.length} articles`);

  const scored = deduplicated.map(scoreArticle);
  const sorted = [...scored].sort((a, b) => b.combinedScore - a.combinedScore);

  const maxArticles = config.content.maxArticlesPerDigest;
  const limited = sorted.slice(0, maxArticles);
  const topStories = limited.slice(0, config.content.topStoriesCount);

  const sourceStats = buildSourceStats(limited);

  const digest: ArticleDigest = {
    date: new Date().toISOString().split("T")[0] as string,
    articles: limited,
    topStories,
    fetchedAt: new Date(),
    sourceStats,
  };

  logger.info(`Digest built: ${limited.length} articles, ${topStories.length} top stories`);

  return digest;
}
