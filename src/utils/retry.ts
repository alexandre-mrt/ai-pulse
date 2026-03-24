import { createLogger } from "./logger";

const logger = createLogger("retry");

interface RetryOptions {
  readonly maxRetries: number;
  readonly delayMs: number;
  readonly backoffMultiplier?: number;
  readonly onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt > config.maxRetries) {
        logger.error(`${label}: all ${config.maxRetries} retries exhausted`, { error });
        break;
      }

      const delay = config.delayMs * (config.backoffMultiplier ?? 2) ** (attempt - 1);
      logger.warn(`${label}: attempt ${attempt} failed, retrying in ${delay}ms`, { error });
      config.onRetry?.(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
