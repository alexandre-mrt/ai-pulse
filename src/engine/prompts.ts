import type { ArticleDigest, ScoredArticle } from "../types/index.ts";

const MAX_SUMMARY_LENGTH = 300;

function truncateSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_LENGTH) return summary;
  return `${summary.slice(0, MAX_SUMMARY_LENGTH)}...`;
}

function formatArticleList(articles: readonly ScoredArticle[]): string {
  return articles
    .map(
      (a, i) =>
        `${i + 1}. **${a.title}** (${a.source})\n   URL: ${a.url}\n   Summary: ${truncateSummary(a.summary)}\n   Score: ${a.combinedScore.toFixed(2)}`,
    )
    .join("\n\n");
}

export const NEWSLETTER_SYSTEM_PROMPT = `You are a professional tech newsletter writer specializing in AI and machine learning content.
Your writing style is:
- Clear, engaging, and informative
- Accessible to both technical and non-technical readers
- Focused on key insights and practical implications
- Professional but not dry — inject enthusiasm where warranted

Generate newsletters that readers look forward to receiving. Lead with the most impactful story.
Always use inline CSS styles in HTML output for email client compatibility.`;

export const TWITTER_SYSTEM_PROMPT = `You are a tech Twitter influencer who writes viral AI news threads.
Your style is:
- Punchy and direct — no filler words
- Each tweet must stand alone but flows naturally into the next
- Strong hooks that make people want to read more
- Use line breaks for readability, not paragraph walls
- End with a clear call-to-action

Hard rules:
- Every tweet MUST be 280 characters or fewer (count carefully)
- First tweet: strong hook about the biggest AI story of the day
- Middle tweets: one key insight per story
- Last tweet: CTA to follow and subscribe to newsletter`;

export const YOUTUBE_SYSTEM_PROMPT = `You are a YouTube script writer for a daily AI news channel.
Your scripts are:
- Conversational and energetic, written to be spoken aloud
- Structured with clear visual cues for the editor
- SEO-optimized titles and descriptions
- Engaging intro that hooks viewers in the first 10 seconds
- Natural transitions between sections

Target: 2-5 minutes of narration (600-1500 words total across all sections).
Timestamps follow MM:SS format (e.g., "00:00", "00:45", "01:30").`;

export function buildNewsletterPrompt(digest: ArticleDigest, newsletterName: string): string {
  const topStories = formatArticleList(digest.topStories);
  const quickLinks = formatArticleList(
    digest.articles.slice(0, 10).filter((a) => !digest.topStories.includes(a)),
  );

  return `Generate a ${newsletterName} newsletter for ${digest.date}.

TOP STORIES:
${topStories}

ADDITIONAL ARTICLES FOR QUICK LINKS SECTION:
${quickLinks}

Requirements:
- Subject line: engaging, mentions the most impactful story, max 60 characters
- Preview text: 1-2 sentences teasing key content, max 120 characters
- HTML body: clean responsive email with inline CSS styles
  * Greeting section
  * Top 5 stories with 2-3 sentence summaries each
  * Quick links section (remaining articles, title + one-line description)
  * Sign-off with newsletter name
- Plain text fallback: same content, no HTML
- Use a dark-accent color scheme (#1a1a2e primary, #16213e secondary, #0f3460 accent, #e94560 highlight)`;
}

export function buildTwitterPrompt(
  digest: ArticleDigest,
  twitterHandle: string,
  newsletterName: string,
): string {
  const stories = formatArticleList(digest.topStories);

  return `Generate a Twitter thread about today's top AI news for ${digest.date}.

TOP STORIES:
${stories}

Requirements:
- 5-10 tweets total
- Tweet 1: Strong hook about the biggest story (max 280 chars)
- Tweets 2-N: One key story per tweet, most important insight (max 280 chars each)
- Last tweet: CTA to follow ${twitterHandle} and subscribe to ${newsletterName} newsletter (max 280 chars)
- Each tweet: standalone but flows naturally to next
- Count characters precisely — HARD limit of 280 per tweet
- No hashtag spam — 1-2 relevant hashtags per tweet max`;
}

export function buildYouTubePrompt(
  digest: ArticleDigest,
  channelName: string,
  twitterHandle: string,
): string {
  const stories = formatArticleList(digest.topStories);

  return `Generate a YouTube script for a daily AI news video for ${digest.date} on the ${channelName} channel.

TOP STORIES TO COVER:
${stories}

Requirements:
- Title: YouTube-optimized with keywords, compelling, max 70 characters
- Description: SEO-friendly, 150-200 words, includes timestamps and subscribe CTA
- Tags: 10-15 relevant tags for YouTube search (AI, specific topics from stories)
- Script sections:
  * Intro (00:00): Hook + what viewers will learn today (~15-20 seconds)
  * One section per top story (~30-45 seconds each)
  * Outro: Summary + subscribe CTA + follow ${twitterHandle} (~20 seconds)
- Each section: timestamp, heading, narration text, visual notes for editor, duration in seconds
- Total target: 2-5 minutes (120-300 seconds)
- Write narration to be spoken naturally — contractions, conversational tone`;
}
