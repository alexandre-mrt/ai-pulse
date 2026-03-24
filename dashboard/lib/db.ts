import { Database } from "bun:sqlite";

const DB_PATH = "../data/ai-pulse.db";

export function openDashboardDb(): Database {
  return new Database(DB_PATH, { readonly: true });
}
