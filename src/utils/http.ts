import { createLogger } from "./logger";

const logger = createLogger("http");

interface RateLimitConfig {
  readonly requestsPerSecond: number;
}

interface FetchOptions extends RequestInit {
  readonly timeout?: number;
  readonly rateLimit?: RateLimitConfig;
}

const lastRequestTime = new Map<string, number>();

async function respectRateLimit(domain: string, config: RateLimitConfig): Promise<void> {
  const minInterval = 1000 / config.requestsPerSecond;
  const lastTime = lastRequestTime.get(domain) ?? 0;
  const elapsed = Date.now() - lastTime;

  if (elapsed < minInterval) {
    const waitMs = minInterval - elapsed;
    logger.debug(`Rate limiting: waiting ${waitMs}ms for ${domain}`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  lastRequestTime.set(domain, Date.now());
}

function getDomain(url: string): string {
  return new URL(url).hostname;
}

export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 15_000, rateLimit, ...fetchOptions } = options;
  const domain = getDomain(url);

  if (rateLimit) {
    await respectRateLimit(domain, rateLimit);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    logger.debug(`Fetching ${url}`);
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  return response.json() as Promise<T>;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithTimeout(url, options);
  return response.text();
}
