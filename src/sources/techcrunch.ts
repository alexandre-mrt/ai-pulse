import { XMLParser } from "fast-xml-parser";
import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchText, withRetry } from "../utils/index.ts";

const logger = createLogger("techcrunch");

const TECHCRUNCH_FEED_URL = "https://techcrunch.com/feed/";

const AI_TECH_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "llm",
  "gpt",
  "openai",
  "anthropic",
  "google",
  "meta",
  "microsoft",
  "startup",
  "funding",
  "robotics",
  "automation",
  "software",
  "tech",
  "cloud",
  "data",
  "model",
  "neural",
] as const;

interface RssItem {
  readonly title?: string;
  readonly link?: string;
  readonly description?: string;
  readonly "dc:creator"?: string;
  readonly author?: string;
  readonly pubDate?: string;
  readonly category?: string | readonly string[];
  readonly guid?: string | { readonly "#text": string; readonly isPermaLink?: boolean };
}

interface RssFeed {
  readonly rss?: {
    readonly channel?: {
      readonly item?: RssItem | readonly RssItem[];
    };
  };
}

function isAiTechRelated(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return AI_TECH_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function extractCategories(category?: string | readonly string[]): readonly string[] {
  if (!category) return [];
  if (typeof category === "string") return [category];
  return category;
}

function extractGuid(item: RssItem): string {
  if (!item.guid) return item.link ?? "";
  if (typeof item.guid === "string") return item.guid;
  return item.guid["#text"] ?? item.link ?? "";
}

function rssItemToRawArticle(item: RssItem): RawArticle {
  const title = item.title ?? "Untitled";
  const url = item.link ?? extractGuid(item);
  const description = item.description ?? "";
  const categories = extractCategories(item.category);
  const author = item.author ?? item["dc:creator"] ?? null;

  return {
    sourceId: extractGuid(item) || url,
    source: "techcrunch",
    title,
    url,
    summary: description.replace(/<[^>]*>/g, "").slice(0, 500),
    author,
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
    score: 0,
    tags: categories,
    metadata: {
      categories,
    },
  };
}

function parseItems(feed: RssFeed): readonly RssItem[] {
  const items = feed.rss?.channel?.item;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  return [items as RssItem];
}

async function fetchFeed(): Promise<string> {
  return withRetry(() => fetchText(TECHCRUNCH_FEED_URL), "techcrunch:feed");
}

function parseFeed(xml: string): readonly RssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const result = parser.parse(xml) as RssFeed;
  return parseItems(result);
}

export class TechCrunchProvider implements SourceProvider {
  readonly name = "techcrunch" as const;
  private readonly maxArticles: number;

  constructor(maxArticles: number) {
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    logger.info("Fetching TechCrunch RSS feed");

    const xml = await fetchFeed();
    const items = parseFeed(xml);

    const filtered = items
      .filter((item) => isAiTechRelated(item.title ?? "", item.description ?? ""))
      .slice(0, this.maxArticles);

    logger.info(`Fetched ${filtered.length} TechCrunch articles`);

    return filtered.map(rssItemToRawArticle);
  }
}
