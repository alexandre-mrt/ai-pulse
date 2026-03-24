import { Database } from "bun:sqlite";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("database");

let db: Database | null = null;
let currentDbPath: string | null = null;

export function getDatabase(dbPath: string): Database {
  if (db) {
    if (currentDbPath && currentDbPath !== dbPath) {
      throw new Error(
        `Database singleton already open at "${currentDbPath}", cannot open at "${dbPath}"`,
      );
    }
    return db;
  }

  logger.info(`Opening database at ${dbPath}`);
  currentDbPath = dbPath;
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(database: Database): void {
  database.exec(`
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

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      stages TEXT DEFAULT '[]',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      pipeline_run_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      published_at TEXT NOT NULL,
      external_id TEXT,
      external_url TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_score ON articles(combined_score DESC);
    CREATE INDEX IF NOT EXISTS idx_publications_channel ON publications(channel);
    CREATE INDEX IF NOT EXISTS idx_publications_run ON publications(pipeline_run_id);
  `);

  logger.info("Database schema initialized");
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    currentDbPath = null;
    logger.info("Database closed");
  }
}
