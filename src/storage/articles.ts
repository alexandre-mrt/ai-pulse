import type { Database } from "bun:sqlite";
import type { RawArticle, ScoredArticle, SourceName } from "../types/index.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("storage:articles");

export function saveArticles(db: Database, articles: readonly RawArticle[]): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles (id, source_id, source, title, url, summary, author, published_at, score, tags, metadata, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let inserted = 0;
  const transaction = db.transaction(() => {
    for (const article of articles) {
      const id = `${article.source}:${article.sourceId}`;
      const result = stmt.run(
        id,
        article.sourceId,
        article.source,
        article.title,
        article.url,
        article.summary,
        article.author,
        article.publishedAt.toISOString(),
        article.score,
        JSON.stringify(article.tags),
        JSON.stringify(article.metadata),
      );
      if (result.changes > 0) inserted++;
    }
  });

  transaction();
  logger.info(`Saved ${inserted} new articles (${articles.length} total)`);
  return inserted;
}

export function updateScores(
  db: Database,
  scores: ReadonlyArray<{
    readonly id: string;
    readonly relevanceScore: number;
    readonly trendingScore: number;
    readonly combinedScore: number;
  }>,
): void {
  const stmt = db.prepare(`
    UPDATE articles SET relevance_score = ?, trending_score = ?, combined_score = ?
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    for (const score of scores) {
      stmt.run(score.relevanceScore, score.trendingScore, score.combinedScore, score.id);
    }
  });

  transaction();
}

export function getTopArticles(
  db: Database,
  date: string,
  limit: number,
): readonly ScoredArticle[] {
  const rows = db
    .prepare(
      `SELECT * FROM articles
     WHERE date(published_at) = ?
     ORDER BY combined_score DESC
     LIMIT ?`,
    )
    .all(date, limit) as ReadonlyArray<Record<string, unknown>>;

  return rows.map(rowToScoredArticle);
}

export function getArticlesBySource(
  db: Database,
  source: SourceName,
  date: string,
): readonly ScoredArticle[] {
  const rows = db
    .prepare(
      `SELECT * FROM articles
     WHERE source = ? AND date(published_at) = ?
     ORDER BY combined_score DESC`,
    )
    .all(source, date) as ReadonlyArray<Record<string, unknown>>;

  return rows.map(rowToScoredArticle);
}

function rowToScoredArticle(row: Record<string, unknown>): ScoredArticle {
  return {
    sourceId: row.source_id as string,
    source: row.source as SourceName,
    title: row.title as string,
    url: row.url as string,
    summary: row.summary as string,
    author: (row.author as string) || null,
    publishedAt: new Date(row.published_at as string),
    score: row.score as number,
    tags: JSON.parse((row.tags as string) || "[]") as readonly string[],
    metadata: JSON.parse((row.metadata as string) || "{}") as Readonly<Record<string, unknown>>,
    relevanceScore: row.relevance_score as number,
    trendingScore: row.trending_score as number,
    combinedScore: row.combined_score as number,
  };
}
