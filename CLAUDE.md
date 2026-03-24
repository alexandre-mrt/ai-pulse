# AI Pulse

Automated AI/tech content pipeline. Aggregates news daily, generates content via Claude API, publishes to newsletter (Beehiiv), Twitter/X, and YouTube (faceless TTS videos).

## Stack
- Runtime: Bun (use bun for everything, not node/npm)
- Language: TypeScript (strict)
- AI: Claude API (@anthropic-ai/sdk)
- TTS: ElevenLabs (@elevenlabs/elevenlabs-js)
- Video: FFmpeg
- Storage: SQLite (bun:sqlite)
- Dashboard: Bun.serve() with HTML imports + React
- Linter: Biome
- XML parsing: fast-xml-parser

## Structure
```
src/
  sources/     — 6 news aggregators (HN, Reddit, TechCrunch, ArXiv, PH, RSS)
  engine/      — Claude API content generation (newsletter, twitter, youtube)
  publishers/  — Beehiiv REST, Twitter OAuth 1.0a, YouTube pipeline
  scheduler/   — Cron-based daily pipeline
  storage/     — SQLite repositories (articles, publications)
  types/       — Shared TypeScript types
  config/      — Environment-based configuration
  utils/       — Logger, HTTP with rate limiting, retry with backoff
dashboard/     — Monitoring UI (Bun.serve + React)
tests/         — Unit tests (bun test)
```

## Commands
```bash
bun install          # Install deps
bun run start        # Run pipeline once
bun run pipeline     # Run pipeline directly
bun run dev          # Dev mode with hot reload
bun run dashboard    # Start dashboard
bun run lint         # Biome lint + format
bun test             # Run tests
bun run typecheck    # TypeScript check
```

## Setup
1. `cp .env.example .env` and fill API keys
2. `bun install`
3. `bun run start`

## Bun specifics
- Bun auto-loads .env — no dotenv needed
- Use `bun:sqlite` not better-sqlite3
- Use `Bun.serve()` not express
- Use `Bun.file` over node:fs readFile/writeFile
- Use `Bun.$\`cmd\`` over execa
- Dashboard uses HTML imports with Bun.serve()

## Testing
```ts
import { test, expect } from "bun:test";
test("example", () => { expect(1).toBe(1); });
```
