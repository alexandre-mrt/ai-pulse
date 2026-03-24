import { XMLParser } from "fast-xml-parser";
import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchText, withRetry } from "../utils/index.ts";

const logger = createLogger("arxiv");

const ARXIV_API_BASE = "http://export.arxiv.org/api/query";
const ARXIV_QUERY = "search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending";

interface ArxivAuthor {
  readonly name?: string;
}

interface ArxivEntry {
  readonly id?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly author?: ArxivAuthor | readonly ArxivAuthor[];
  readonly published?: string;
  readonly updated?: string;
  readonly category?: { readonly "@_term": string } | readonly { readonly "@_term": string }[];
  readonly link?:
    | { readonly "@_href": string; readonly "@_rel": string }
    | readonly { readonly "@_href": string; readonly "@_rel": string }[];
}

interface ArxivFeed {
  readonly feed?: {
    readonly entry?: ArxivEntry | readonly ArxivEntry[];
  };
}

function extractAuthors(author?: ArxivAuthor | readonly ArxivAuthor[]): string | null {
  if (!author) return null;
  if (Array.isArray(author)) {
    const first = (author as readonly ArxivAuthor[])[0];
    return first?.name ?? null;
  }
  return (author as ArxivAuthor).name ?? null;
}

function extractCategories(
  category?: { readonly "@_term": string } | readonly { readonly "@_term": string }[],
): readonly string[] {
  if (!category) return [];
  if (Array.isArray(category)) {
    return (category as readonly { readonly "@_term": string }[]).map((c) => c["@_term"]);
  }
  return [(category as { readonly "@_term": string })["@_term"]];
}

function extractArxivUrl(entry: ArxivEntry): string {
  const id = entry.id ?? "";
  // ArXiv id field is already the URL: http://arxiv.org/abs/...
  return id.trim();
}

function extractHtmlUrl(entry: ArxivEntry): string {
  const links = entry.link;
  if (!links) return extractArxivUrl(entry);

  const linkArray = Array.isArray(links)
    ? (links as readonly { readonly "@_href": string; readonly "@_rel": string }[])
    : [links as { readonly "@_href": string; readonly "@_rel": string }];

  const htmlLink = linkArray.find((l) => l["@_rel"] === "alternate");
  return htmlLink?.["@_href"] ?? extractArxivUrl(entry);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function entryToRawArticle(entry: ArxivEntry): RawArticle {
  const url = extractHtmlUrl(entry);
  const arxivId = extractArxivUrl(entry).split("/abs/").pop() ?? "";

  return {
    sourceId: `arxiv_${arxivId}`,
    source: "arxiv",
    title: cleanText(entry.title ?? "Untitled"),
    url,
    summary: cleanText(entry.summary ?? "").slice(0, 800),
    author: extractAuthors(entry.author),
    publishedAt: entry.published ? new Date(entry.published) : new Date(),
    score: 0,
    tags: extractCategories(entry.category),
    metadata: {
      arxivId,
      updated: entry.updated ?? null,
      categories: extractCategories(entry.category),
    },
  };
}

function parseEntries(feed: ArxivFeed): readonly ArxivEntry[] {
  const entry = feed.feed?.entry;
  if (!entry) return [];
  if (Array.isArray(entry)) return entry as readonly ArxivEntry[];
  return [entry as ArxivEntry];
}

async function fetchArxivXml(maxResults: number): Promise<string> {
  const url = `${ARXIV_API_BASE}?${ARXIV_QUERY}&max_results=${maxResults}`;
  return withRetry(() => fetchText(url), "arxiv:query");
}

function parseFeed(xml: string): readonly ArxivEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const result = parser.parse(xml) as ArxivFeed;
  return parseEntries(result);
}

export class ArxivProvider implements SourceProvider {
  readonly name = "arxiv" as const;
  private readonly maxArticles: number;

  constructor(maxArticles: number) {
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    logger.info("Fetching ArXiv papers");

    const xml = await fetchArxivXml(this.maxArticles);
    const entries = parseFeed(xml);

    logger.info(`Fetched ${entries.length} ArXiv papers`);

    return entries.map(entryToRawArticle);
  }
}
