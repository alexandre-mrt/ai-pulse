import type { Config } from "../config/index.ts";
import type { NewsletterContent } from "../types/index.ts";
import { createLogger, fetchJson, withRetry } from "../utils/index.ts";

const logger = createLogger("publisher:beehiiv");

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

interface BeehiivPostResponse {
  readonly data: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly web_url: string;
    readonly slug: string;
  };
}

interface BeehiivPostPayload {
  readonly title: string;
  readonly subtitle: string;
  readonly content: ReadonlyArray<{
    readonly type: string;
    readonly [key: string]: unknown;
  }>;
  readonly emailSettings: {
    readonly emailSubjectLine: string;
    readonly emailPreviewText: string;
  };
  readonly scheduledAt?: string;
}

function buildPostPayload(content: NewsletterContent): BeehiivPostPayload {
  return {
    title: content.subject,
    subtitle: content.previewText,
    content: [
      {
        type: "html",
        html: content.htmlBody,
      },
    ],
    emailSettings: {
      emailSubjectLine: content.subject,
      emailPreviewText: content.previewText,
    },
  };
}

export async function publishNewsletter(
  config: Config,
  content: NewsletterContent,
): Promise<{ readonly id: string; readonly url: string }> {
  logger.info("Publishing newsletter to Beehiiv");

  const payload = buildPostPayload(content);

  const response = await withRetry(
    () =>
      fetchJson<BeehiivPostResponse>(
        `${BEEHIIV_API_BASE}/publications/${config.beehiiv.publicationId}/posts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.beehiiv.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      ),
    "beehiiv:publish",
    { maxRetries: 2, delayMs: 3000 },
  );

  logger.info(`Newsletter published: ${response.data.id}`, {
    url: response.data.web_url,
    status: response.data.status,
  });

  return {
    id: response.data.id,
    url: response.data.web_url,
  };
}

export async function createDraft(
  config: Config,
  content: NewsletterContent,
): Promise<{ readonly id: string; readonly url: string }> {
  logger.info("Creating newsletter draft on Beehiiv");

  const payload = {
    ...buildPostPayload(content),
    status: "draft",
  };

  const response = await withRetry(
    () =>
      fetchJson<BeehiivPostResponse>(
        `${BEEHIIV_API_BASE}/publications/${config.beehiiv.publicationId}/posts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.beehiiv.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      ),
    "beehiiv:draft",
    { maxRetries: 2, delayMs: 3000 },
  );

  logger.info(`Newsletter draft created: ${response.data.id}`);

  return {
    id: response.data.id,
    url: response.data.web_url,
  };
}
