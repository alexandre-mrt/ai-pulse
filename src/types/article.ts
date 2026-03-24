export type SourceName =
  | "hackernews"
  | "reddit"
  | "techcrunch"
  | "arxiv"
  | "producthunt"
  | "rss";

export interface RawArticle {
  readonly sourceId: string;
  readonly source: SourceName;
  readonly title: string;
  readonly url: string;
  readonly summary: string;
  readonly author: string | null;
  readonly publishedAt: Date;
  readonly score: number;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ScoredArticle extends RawArticle {
  readonly relevanceScore: number;
  readonly trendingScore: number;
  readonly combinedScore: number;
}

export interface ArticleDigest {
  readonly date: string;
  readonly articles: readonly ScoredArticle[];
  readonly topStories: readonly ScoredArticle[];
  readonly fetchedAt: Date;
  readonly sourceStats: Readonly<Record<SourceName, number>>;
}
