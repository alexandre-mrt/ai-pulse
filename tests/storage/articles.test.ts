import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getArticlesBySource,
  getTopArticles,
  saveArticles,
  updateScores,
} from "../../src/storage/articles.ts";
import type { RawArticle, ScoredArticle, SourceName } from "../../src/types/index.ts";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT NOT NULL,
      author TEXT,
      published_at TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      relevance_score REAL DEFAULT 0,
      trending_score REAL DEFAULT 0,
      combined_score REAL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );
  `);
  return db;
}

function makeRawArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    sourceId: "hn-001",
    source: "hackernews" as SourceName,
    title: "Test Article",
    url: "https://example.com/article",
    summary: "A test article summary.",
    author: "Author Name",
    publishedAt: new Date("2025-01-01T10:00:00Z"),
    score: 50,
    tags: ["ai"],
    metadata: {},
    ...overrides,
  };
}

let db: Database;

beforeEach(() => {
  db = makeDb();
});

describe("saveArticles", () => {
  test("inserts new articles and returns count", () => {
    const articles = [makeRawArticle({ sourceId: "hn-001" })];
    const count = saveArticles(db, articles);
    expect(count).toBe(1);
  });

  test("inserts multiple new articles", () => {
    const articles = [
      makeRawArticle({ sourceId: "hn-001", url: "https://example.com/1" }),
      makeRawArticle({ sourceId: "hn-002", url: "https://example.com/2" }),
      makeRawArticle({ sourceId: "hn-003", url: "https://example.com/3" }),
    ];
    const count = saveArticles(db, articles);
    expect(count).toBe(3);
  });

  test("ignores duplicate (same source + sourceId)", () => {
    const article = makeRawArticle({ sourceId: "hn-dup" });
    saveArticles(db, [article]);
    const count = saveArticles(db, [article]);
    expect(count).toBe(0);
  });

  test("partial insert — only new articles are counted", () => {
    const existing = makeRawArticle({ sourceId: "hn-existing" });
    saveArticles(db, [existing]);

    const newArticle = makeRawArticle({
      sourceId: "hn-new",
      url: "https://example.com/new",
    });
    const count = saveArticles(db, [existing, newArticle]);
    expect(count).toBe(1);
  });

  test("saves article fields correctly", () => {
    const article = makeRawArticle({
      sourceId: "hn-fields",
      title: "Exact Title",
      url: "https://exact.url/",
      summary: "Exact summary.",
      author: "Exact Author",
      publishedAt: new Date("2025-03-15T08:30:00Z"),
      score: 42,
      tags: ["tag1", "tag2"],
      metadata: { extra: "data" },
    });
    saveArticles(db, [article]);

    const row = db
      .prepare("SELECT * FROM articles WHERE source_id = ?")
      .get("hn-fields") as Record<string, unknown>;
    expect(row.title).toBe("Exact Title");
    expect(row.url).toBe("https://exact.url/");
    expect(row.summary).toBe("Exact summary.");
    expect(row.author).toBe("Exact Author");
    expect(row.score).toBe(42);
    expect(JSON.parse(row.tags as string)).toEqual(["tag1", "tag2"]);
    expect(JSON.parse(row.metadata as string)).toEqual({ extra: "data" });
  });

  test("handles empty articles array", () => {
    const count = saveArticles(db, []);
    expect(count).toBe(0);
  });

  test("handles null author", () => {
    const article = makeRawArticle({ sourceId: "hn-nullauthor", author: null });
    expect(() => saveArticles(db, [article])).not.toThrow();
  });
});

describe("getTopArticles", () => {
  beforeEach(() => {
    const articles = [
      makeRawArticle({
        sourceId: "hn-low",
        publishedAt: new Date("2025-01-01T08:00:00Z"),
      }),
      makeRawArticle({
        sourceId: "hn-high",
        publishedAt: new Date("2025-01-01T09:00:00Z"),
      }),
      makeRawArticle({
        sourceId: "hn-mid",
        publishedAt: new Date("2025-01-01T10:00:00Z"),
      }),
    ];
    saveArticles(db, articles);

    db.prepare("UPDATE articles SET combined_score = ? WHERE source_id = ?").run(0.2, "hn-low");
    db.prepare("UPDATE articles SET combined_score = ? WHERE source_id = ?").run(0.9, "hn-high");
    db.prepare("UPDATE articles SET combined_score = ? WHERE source_id = ?").run(0.5, "hn-mid");
  });

  test("returns articles sorted by combined_score DESC", () => {
    const results = getTopArticles(db, "2025-01-01", 10);
    expect(results[0].sourceId).toBe("hn-high");
    expect(results[1].sourceId).toBe("hn-mid");
    expect(results[2].sourceId).toBe("hn-low");
  });

  test("respects limit", () => {
    const results = getTopArticles(db, "2025-01-01", 2);
    expect(results.length).toBe(2);
    expect(results[0].sourceId).toBe("hn-high");
  });

  test("filters by date — returns only articles for that date", () => {
    const otherDayArticle = makeRawArticle({
      sourceId: "hn-other-day",
      publishedAt: new Date("2025-01-02T10:00:00Z"),
    });
    saveArticles(db, [otherDayArticle]);

    const results = getTopArticles(db, "2025-01-01", 10);
    const ids = results.map((a) => a.sourceId);
    expect(ids).not.toContain("hn-other-day");
  });

  test("returns empty array when no articles match date", () => {
    const results = getTopArticles(db, "2099-12-31", 10);
    expect(results).toEqual([]);
  });

  test("returns ScoredArticle objects with correct shape", () => {
    const results = getTopArticles(db, "2025-01-01", 1);
    expect(results.length).toBeGreaterThan(0);
    const article = results[0];
    expect(typeof article.sourceId).toBe("string");
    expect(typeof article.source).toBe("string");
    expect(typeof article.title).toBe("string");
    expect(typeof article.combinedScore).toBe("number");
    expect(article.publishedAt).toBeInstanceOf(Date);
    expect(Array.isArray(article.tags)).toBe(true);
  });
});

describe("getArticlesBySource", () => {
  beforeEach(() => {
    saveArticles(db, [
      makeRawArticle({
        sourceId: "hn-001",
        source: "hackernews",
        publishedAt: new Date("2025-01-01T10:00:00Z"),
      }),
      makeRawArticle({
        sourceId: "hn-002",
        source: "hackernews",
        publishedAt: new Date("2025-01-01T11:00:00Z"),
      }),
      makeRawArticle({
        sourceId: "reddit-001",
        source: "reddit",
        publishedAt: new Date("2025-01-01T10:00:00Z"),
      }),
    ]);
  });

  test("returns only articles from the specified source", () => {
    const results = getArticlesBySource(db, "hackernews", "2025-01-01");
    expect(results.every((a) => a.source === "hackernews")).toBe(true);
    expect(results.length).toBe(2);
  });

  test("does not return articles from other sources", () => {
    const results = getArticlesBySource(db, "hackernews", "2025-01-01");
    const ids = results.map((a) => a.sourceId);
    expect(ids).not.toContain("reddit-001");
  });

  test("filters by date", () => {
    const results = getArticlesBySource(db, "hackernews", "2025-01-02");
    expect(results).toEqual([]);
  });

  test("returns empty array when source has no articles on that date", () => {
    const results = getArticlesBySource(db, "arxiv", "2025-01-01");
    expect(results).toEqual([]);
  });
});

describe("updateScores", () => {
  test("updates relevance, trending, and combined scores", () => {
    const article = makeRawArticle({ sourceId: "hn-score-test" });
    saveArticles(db, [article]);
    const id = `${article.source}:${article.sourceId}`;

    updateScores(db, [
      { id, relevanceScore: 0.7, trendingScore: 0.6, combinedScore: 0.65 },
    ]);

    const row = db.prepare("SELECT * FROM articles WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    expect(row.relevance_score).toBeCloseTo(0.7);
    expect(row.trending_score).toBeCloseTo(0.6);
    expect(row.combined_score).toBeCloseTo(0.65);
  });
});
