import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchJson, withRetry } from "../utils/index.ts";

const logger = createLogger("reddit");

const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_BASE = "https://oauth.reddit.com";
const RATE_LIMIT = { requestsPerSecond: 1 };
const SUBREDDITS = ["artificial", "MachineLearning", "technology", "singularity"] as const;

interface RedditTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

interface RedditPost {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly permalink: string;
  readonly selftext: string;
  readonly author: string;
  readonly created_utc: number;
  readonly score: number;
  readonly subreddit: string;
  readonly link_flair_text: string | null;
  readonly thumbnail: string;
  readonly is_self: boolean;
}

interface RedditListingChild {
  readonly kind: string;
  readonly data: RedditPost;
}

interface RedditListing {
  readonly kind: string;
  readonly data: {
    readonly children: readonly RedditListingChild[];
  };
}

interface RedditConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly userAgent: string;
}

async function fetchAccessToken(config: RedditConfig): Promise<string> {
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  const response = await withRetry(
    () =>
      fetchJson<RedditTokenResponse>(REDDIT_AUTH_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": config.userAgent,
        },
        body: "grant_type=client_credentials",
      }),
    "reddit:auth",
  );
  return response.access_token;
}

async function fetchSubredditPosts(
  subreddit: string,
  token: string,
  userAgent: string,
): Promise<readonly RedditPost[]> {
  const url = `${REDDIT_API_BASE}/r/${subreddit}/hot.json?limit=25`;
  const listing = await withRetry(
    () =>
      fetchJson<RedditListing>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": userAgent,
        },
        rateLimit: RATE_LIMIT,
      }),
    `reddit:subreddit:${subreddit}`,
  );
  return listing.data.children.map((child) => child.data);
}

function postToRawArticle(post: RedditPost): RawArticle {
  const postUrl = post.is_self ? `https://reddit.com${post.permalink}` : post.url;

  return {
    sourceId: `reddit_${post.id}`,
    source: "reddit",
    title: post.title,
    url: postUrl,
    summary: post.selftext ? post.selftext.slice(0, 500) : "",
    author: post.author || null,
    publishedAt: new Date(post.created_utc * 1000),
    score: post.score,
    tags: post.link_flair_text ? [post.link_flair_text] : [],
    metadata: {
      subreddit: post.subreddit,
      permalink: `https://reddit.com${post.permalink}`,
      isSelf: post.is_self,
    },
  };
}

export class RedditProvider implements SourceProvider {
  readonly name = "reddit" as const;
  private readonly config: RedditConfig;
  private readonly maxArticles: number;

  constructor(config: RedditConfig, maxArticles: number) {
    this.config = config;
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    logger.info("Fetching Reddit posts");

    const token = await fetchAccessToken(this.config);

    const allPosts = await Promise.all(
      SUBREDDITS.map((sub) =>
        fetchSubredditPosts(sub, token, this.config.userAgent).catch((error) => {
          logger.warn(`Failed to fetch r/${sub}`, { error });
          return [] as RedditPost[];
        }),
      ),
    );

    const merged = allPosts.flat();
    const sorted = [...merged].sort((a, b) => b.score - a.score);
    const limited = sorted.slice(0, this.maxArticles);

    logger.info(`Fetched ${limited.length} Reddit posts`);

    return limited.map(postToRawArticle);
  }
}
