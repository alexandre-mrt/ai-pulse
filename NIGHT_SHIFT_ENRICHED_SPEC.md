# AI Pulse — Enriched Spec

## Overview
Fully automated, production-grade content pipeline that aggregates AI/tech news daily, generates content via Claude API, and publishes across 3 channels.

## Channels
1. **Newsletter** — Beehiiv API, daily email
2. **Twitter/X** — Thread (5-10 tweets) via X API v2
3. **YouTube** — Faceless 2-5 min news recap, ElevenLabs TTS + FFmpeg

## Content
- **Language**: English
- **Niche**: AI & Tech trends
- **Frequency**: Daily
- **Tone**: Professional, insightful, concise

## Sources
- HackerNews API (top stories)
- Reddit API (r/artificial, r/MachineLearning, r/technology)
- TechCrunch RSS
- ArXiv API (cs.AI, cs.LG)
- ProductHunt API (new launches)
- Custom RSS feeds (configurable)

## Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict, no `any`)
- **AI**: Claude API (Anthropic SDK)
- **TTS**: ElevenLabs API
- **Video**: FFmpeg (programmatic)
- **Dashboard**: Next.js
- **Linter**: Biome

## Architecture
```
ai-pulse/
├── src/
│   ├── sources/          # Source aggregators
│   │   ├── hackernews.ts
│   │   ├── reddit.ts
│   │   ├── techcrunch.ts
│   │   ├── arxiv.ts
│   │   ├── producthunt.ts
│   │   ├── rss.ts
│   │   └── index.ts      # Unified aggregator
│   ├── engine/           # Content generation
│   │   ├── generator.ts  # Claude API orchestration
│   │   ├── prompts.ts    # System/user prompts
│   │   ├── newsletter.ts # Newsletter formatter
│   │   ├── twitter.ts    # Thread formatter
│   │   └── youtube.ts    # Script formatter
│   ├── publishers/       # Channel publishers
│   │   ├── beehiiv.ts    # Newsletter
│   │   ├── twitter.ts    # X API v2
│   │   └── youtube/      # YouTube pipeline
│   │       ├── tts.ts    # ElevenLabs
│   │       ├── video.ts  # FFmpeg assembly
│   │       └── upload.ts # YouTube Data API
│   ├── scheduler/        # Cron orchestration
│   │   ├── pipeline.ts   # Main pipeline
│   │   └── cron.ts       # Scheduling
│   ├── storage/          # Data persistence
│   │   ├── articles.ts   # Article repository
│   │   └── publications.ts # Publication history
│   ├── types/            # Shared types
│   │   ├── article.ts
│   │   ├── content.ts
│   │   └── pipeline.ts
│   ├── config/           # Configuration
│   │   └── index.ts
│   └── utils/            # Shared utilities
│       ├── http.ts       # Rate-limited fetch
│       ├── retry.ts      # Retry logic
│       └── logger.ts     # Structured logging
├── dashboard/            # Next.js monitoring app
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── package.json
├── data/                 # Local data storage (gitignored)
├── tests/
│   ├── sources/
│   ├── engine/
│   └── publishers/
├── .env.example
├── biome.json
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## Phases
1. **Foundation** — Project setup, types, config, utilities
2. **Sources** — All 6 source aggregators + unified interface
3. **Engine** — Claude API content generation (newsletter, thread, script)
4. **Publishers** — Beehiiv, Twitter, YouTube pipeline
5. **Scheduler** — Cron pipeline, retry, status tracking
6. **Dashboard** — Next.js monitoring UI
7. **Testing** — Unit + integration tests
8. **Polish** — Code review, security review, documentation

## API Accounts Needed
All keys go in `.env`. The code uses placeholders until accounts are created.
- Anthropic API key (Claude)
- Beehiiv API key + publication ID
- X/Twitter API v2 (OAuth 2.0 with PKCE)
- ElevenLabs API key + voice ID
- YouTube Data API v3 (OAuth 2.0)
- Reddit API (client ID + secret)
- ProductHunt API (developer token)

## Quality Requirements
- Production-grade: error handling, retry logic, structured logging
- Graceful degradation: if one channel fails, others still publish
- Files < 400 lines, functions < 50 lines
- Biome lint/format passing
- Unit tests for core modules
