import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { closeDatabase, getDatabase } from "../../src/storage/database.ts";

afterEach(() => {
  closeDatabase();
});

describe("getDatabase", () => {
  test("creates and returns a Database instance", () => {
    const db = getDatabase(":memory:");
    expect(db).toBeInstanceOf(Database);
  });

  test("returns the same instance on subsequent calls", () => {
    const db1 = getDatabase(":memory:");
    const db2 = getDatabase(":memory:");
    expect(db1).toBe(db2);
  });

  test("initializes schema — articles table exists", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'")
      .get() as { name: string } | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("articles");
  });

  test("initializes schema — pipeline_runs table exists", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_runs'")
      .get() as { name: string } | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("pipeline_runs");
  });

  test("initializes schema — publications table exists", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='publications'")
      .get() as { name: string } | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("publications");
  });

  test("articles table has correct columns", () => {
    const db = getDatabase(":memory:");
    const columns = db
      .prepare("PRAGMA table_info(articles)")
      .all() as ReadonlyArray<{ name: string }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("source_id");
    expect(names).toContain("source");
    expect(names).toContain("title");
    expect(names).toContain("url");
    expect(names).toContain("summary");
    expect(names).toContain("combined_score");
    expect(names).toContain("relevance_score");
    expect(names).toContain("trending_score");
  });

  test("schema has index on articles(source)", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_articles_source'",
      )
      .get() as { name: string } | null;
    expect(row?.name).toBe("idx_articles_source");
  });

  test("schema has index on articles(published_at)", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_articles_published'",
      )
      .get() as { name: string } | null;
    expect(row?.name).toBe("idx_articles_published");
  });

  test("schema has index on articles(combined_score)", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_articles_score'",
      )
      .get() as { name: string } | null;
    expect(row?.name).toBe("idx_articles_score");
  });

  test("schema has index on publications(channel)", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_publications_channel'",
      )
      .get() as { name: string } | null;
    expect(row?.name).toBe("idx_publications_channel");
  });

  test("schema has index on publications(pipeline_run_id)", () => {
    const db = getDatabase(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_publications_run'",
      )
      .get() as { name: string } | null;
    expect(row?.name).toBe("idx_publications_run");
  });
});

describe("closeDatabase", () => {
  test("closes database without error when open", () => {
    getDatabase(":memory:");
    expect(() => closeDatabase()).not.toThrow();
  });

  test("is idempotent — safe to call when already closed", () => {
    expect(() => closeDatabase()).not.toThrow();
  });

  test("after close, getDatabase creates a new instance", () => {
    const db1 = getDatabase(":memory:");
    closeDatabase();
    const db2 = getDatabase(":memory:");
    expect(db2).toBeInstanceOf(Database);
    expect(db1).not.toBe(db2);
  });
});
