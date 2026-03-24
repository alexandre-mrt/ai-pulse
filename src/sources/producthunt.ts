import type { RawArticle } from "../types/article.ts";
import type { SourceProvider } from "../types/pipeline.ts";
import { createLogger, fetchJson, withRetry } from "../utils/index.ts";

const logger = createLogger("producthunt");

const PRODUCTHUNT_API_URL = "https://api.producthunt.com/v2/api/graphql";

const AI_TECH_TOPICS = [
  "artificial intelligence",
  "machine learning",
  "developer tools",
  "productivity",
  "saas",
  "open source",
  "api",
  "automation",
  "data analytics",
  "no-code",
  "tech",
  "software engineering",
  "design tools",
  "cloud",
  "security",
] as const;

const POSTS_QUERY = `{
  posts(first: 20, order: RANKING) {
    edges {
      node {
        id
        name
        tagline
        url
        votesCount
        createdAt
        topics {
          edges {
            node {
              name
            }
          }
        }
        user {
          name
        }
      }
    }
  }
}`;

interface PHTopicNode {
  readonly name: string;
}

interface PHTopicEdge {
  readonly node: PHTopicNode;
}

interface PHUserNode {
  readonly name: string;
}

interface PHPostNode {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly url: string;
  readonly votesCount: number;
  readonly createdAt: string;
  readonly topics: {
    readonly edges: readonly PHTopicEdge[];
  };
  readonly user: PHUserNode | null;
}

interface PHPostEdge {
  readonly node: PHPostNode;
}

interface PHGraphQLResponse {
  readonly data?: {
    readonly posts?: {
      readonly edges?: readonly PHPostEdge[];
    };
  };
  readonly errors?: readonly { readonly message: string }[];
}

function extractTopicNames(post: PHPostNode): readonly string[] {
  return post.topics.edges.map((edge) => edge.node.name.toLowerCase());
}

function isAiTechRelated(post: PHPostNode): boolean {
  const topics = extractTopicNames(post);
  const combined = `${post.name} ${post.tagline}`.toLowerCase();

  const hasTechTopic = topics.some((topic) =>
    AI_TECH_TOPICS.some((keyword) => topic.includes(keyword)),
  );

  const hasTechKeyword = AI_TECH_TOPICS.some((keyword) => combined.includes(keyword));

  return hasTechTopic || hasTechKeyword;
}

function postToRawArticle(post: PHPostNode): RawArticle {
  const topics = post.topics.edges.map((edge) => edge.node.name);

  return {
    sourceId: `ph_${post.id}`,
    source: "producthunt",
    title: post.name,
    url: post.url,
    summary: post.tagline,
    author: post.user?.name ?? null,
    publishedAt: new Date(post.createdAt),
    score: post.votesCount,
    tags: topics,
    metadata: {
      votesCount: post.votesCount,
      topics,
    },
  };
}

export class ProductHuntProvider implements SourceProvider {
  readonly name = "producthunt" as const;
  private readonly accessToken: string;
  private readonly maxArticles: number;

  constructor(accessToken: string, maxArticles: number) {
    this.accessToken = accessToken;
    this.maxArticles = maxArticles;
  }

  async fetch(): Promise<readonly RawArticle[]> {
    logger.info("Fetching Product Hunt posts");

    const response = await withRetry(
      () =>
        fetchJson<PHGraphQLResponse>(PRODUCTHUNT_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: POSTS_QUERY }),
        }),
      "producthunt:posts",
    );

    if (response.errors && response.errors.length > 0) {
      const firstError = response.errors[0];
      throw new Error(`ProductHunt GraphQL error: ${firstError?.message ?? "unknown"}`);
    }

    const edges = response.data?.posts?.edges ?? [];
    const posts = edges.map((edge) => edge.node);

    const filtered = posts.filter(isAiTechRelated).slice(0, this.maxArticles);

    logger.info(`Fetched ${filtered.length} ProductHunt posts`);

    return filtered.map(postToRawArticle);
  }
}
