import { XMLParser } from "fast-xml-parser";
import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchText, withRetry } from "../utils/index.ts";

const logger = createLogger("rss");

const DEFAULT_FEEDS = [
  "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
  "https://feeds.arstechnica.com/arstechnica/technology-lab",
  "https://www.technologyreview.com/feed/",
] as const;

// RSS 2.0 item shape
interface Rss2Item {
  readonly title?: string;
  readonly link?: string;
  readonly description?: string;
  readonly author?: string;
  readonly "dc:creator"?: string;
  readonly pubDate?: string;
  readonly category?: string | readonly string[];
  readonly guid?: string | { readonly "#text": string };
}

interface Rss2Channel {
  readonly item?: Rss2Item | readonly Rss2Item[];
}

interface Rss2Feed {
  readonly rss?: {
    readonly channel?: Rss2Channel;
  };
}

// Atom feed shape
interface AtomEntry {
  readonly id?: string;
  readonly title?: string | { readonly "#text": string };
  readonly summary?: string;
  readonly content?: string | { readonly "#text": string };
  readonly author?: { readonly name?: string } | readonly { readonly name?: string }[];
  readonly published?: string;
  readonly updated?: string;
  readonly link?: { readonly "@_href": string } | readonly { readonly "@_href": string }[];
  readonly category?: { readonly "@_term": string } | readonly { readonly "@_term": string }[];
}

interface AtomFeed {
  readonly feed?: {
    readonly entry?: AtomEntry | readonly AtomEntry[];
  };
}

type ParsedFeed = Rss2Feed | AtomFeed;

function getRssItems(parsed: ParsedFeed): readonly Rss2Item[] {
  const rss = (parsed as Rss2Feed).rss;
  const items = rss?.channel?.item;
  if (!items) return [];
  if (Array.isArray(items)) return items as readonly Rss2Item[];
  return [items as Rss2Item];
}

function getAtomEntries(parsed: ParsedFeed): readonly AtomEntry[] {
  const feed = (parsed as AtomFeed).feed;
  const entries = feed?.entry;
  if (!entries) return [];
  if (Array.isArray(entries)) return entries as readonly AtomEntry[];
  return [entries as AtomEntry];
}

function extractAtomTitle(title?: string | { readonly "#text": string }): string {
  if (!title) return "Untitled";
  if (typeof title === "string") return title;
  return title["#text"] ?? "Untitled";
}

function extractAtomContent(content?: string | { readonly "#text": string }): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content["#text"] ?? "";
}

function extractAtomLink(
  link?: { readonly "@_href": string } | readonly { readonly "@_href": string }[],
): string {
  if (!link) return "";
  if (Array.isArray(link)) {
    const first = (link as readonly { readonly "@_href": string }[])[0];
    return first?.["@_href"] ?? "";
  }
  return (link as { readonly "@_href": string })["@_href"] ?? "";
}

function extractAtomAuthor(
  author?: { readonly name?: string } | readonly { readonly name?: string }[],
): string | null {
  if (!author) return null;
  if (Array.isArray(author)) {
    const first = (author as readonly { readonly name?: string }[])[0];
    return first?.name ?? null;
  }
  return (author as { readonly name?: string }).name ?? null;
}

function extractRssCategories(category?: string | readonly string[]): readonly string[] {
  if (!category) return [];
  if (typeof category === "string") return [category];
  return category;
}

function extractAtomCategories(
  category?: { readonly "@_term": string } | readonly { readonly "@_term": string }[],
): readonly string[] {
  if (!category) return [];
  if (Array.isArray(category)) {
    return (category as readonly { readonly "@_term": string }[]).map((c) => c["@_term"]);
  }
  return [(category as { readonly "@_term": string })["@_term"]];
}

function extractRssGuid(item: Rss2Item): string {
  if (!item.guid) return item.link ?? "";
  if (typeof item.guid === "string") return item.guid;
  return item.guid["#text"] ?? item.link ?? "";
}

function rss2ItemToRawArticle(item: Rss2Item, feedUrl: string): RawArticle {
  const url = item.link ?? extractRssGuid(item);
  const description = item.description ?? "";
  return {
    sourceId: extractRssGuid(item) || url,
    source: "rss",
    title: item.title ?? "Untitled",
    url,
    summary: description.replace(/<[^>]*>/g, "").slice(0, 500),
    author: item.author ?? item["dc:creator"] ?? null,
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
    score: 0,
    tags: extractRssCategories(item.category),
    metadata: {
      feedUrl,
      categories: extractRssCategories(item.category),
    },
  };
}

function atomEntryToRawArticle(entry: AtomEntry, feedUrl: string): RawArticle {
  const url = extractAtomLink(entry.link);
  const content = extractAtomContent(entry.content ?? entry.summary);
  return {
    sourceId: entry.id ?? url,
    source: "rss",
    title: extractAtomTitle(entry.title),
    url,
    summary: content.replace(/<[^>]*>/g, "").slice(0, 500),
    author: extractAtomAuthor(entry.author),
    publishedAt: entry.published ? new Date(entry.published) : new Date(),
    score: 0,
    tags: extractAtomCategories(entry.category),
    metadata: {
      feedUrl,
      updated: entry.updated ?? null,
      categories: extractAtomCategories(entry.category),
    },
  };
}

function parseFeedXml(xml: string, feedUrl: string): readonly RawArticle[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml) as ParsedFeed;
  const isAtom = !!(parsed as AtomFeed).feed;

  if (isAtom) {
    const entries = getAtomEntries(parsed);
    return entries.map((entry) => atomEntryToRawArticle(entry, feedUrl));
  }

  const items = getRssItems(parsed);
  return items.map((item) => rss2ItemToRawArticle(item, feedUrl));
}

function getFeedUrls(): readonly string[] {
  const envFeeds = process.env.RSS_FEEDS;
  if (envFeeds) {
    return envFeeds
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }
  return DEFAULT_FEEDS;
}

async function fetchAndParseFeed(feedUrl: string): Promise<readonly RawArticle[]> {
  const xml = await withRetry(() => fetchText(feedUrl), `rss:feed:${feedUrl}`, {
    maxRetries: 2,
  });
  return parseFeedXml(xml, feedUrl);
}

export class RssProvider implements SourceProvider {
  readonly name = "rss" as const;
  private readonly maxArticles: number;

  constructor(maxArticles: number) {
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    const feedUrls = getFeedUrls();
    logger.info(`Fetching ${feedUrls.length} RSS feeds`);

    const results = await Promise.all(
      feedUrls.map((url) =>
        fetchAndParseFeed(url).catch((error) => {
          logger.warn(`Failed to fetch RSS feed ${url}`, { error });
          return [] as RawArticle[];
        }),
      ),
    );

    const merged = results.flat();
    const limited = merged.slice(0, this.maxArticles);

    logger.info(`Fetched ${limited.length} RSS articles`);

    return limited;
  }
}
