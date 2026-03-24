import { describe, expect, mock, test } from "bun:test";
import { withRetry } from "../../src/utils/retry";

// Replace setTimeout globally to avoid real delays in tests
const originalSetTimeout = globalThis.setTimeout;

function withFakeTimers(fn: () => Promise<void>): Promise<void> {
  // We override setTimeout to resolve immediately so tests don't sleep
  const fake = (cb: () => void, _ms: number) => {
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  };
  // @ts-expect-error replacing global for test
  globalThis.setTimeout = fake;
  return fn().finally(() => {
    globalThis.setTimeout = originalSetTimeout;
  });
}

describe("withRetry", () => {
  test("returns result immediately on first success", async () => {
    const fn = mock(async () => "ok");
    const result = await withRetry(fn, "test", { maxRetries: 3, delayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on failure and returns result when succeeds", async () => {
    await withFakeTimers(async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        if (calls < 3) throw new Error("transient");
        return "recovered";
      };

      const result = await withRetry(fn, "test", { maxRetries: 3, delayMs: 1 });
      expect(result).toBe("recovered");
      expect(calls).toBe(3);
    });
  });

  test("throws after maxRetries exhausted", async () => {
    await withFakeTimers(async () => {
      const err = new Error("always fails");
      const fn = async () => {
        throw err;
      };

      await expect(withRetry(fn, "test", { maxRetries: 2, delayMs: 1 })).rejects.toThrow(
        "always fails",
      );
    });
  });

  test("calls fn exactly maxRetries + 1 times when always failing", async () => {
    await withFakeTimers(async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        throw new Error("fail");
      };

      await expect(withRetry(fn, "test", { maxRetries: 3, delayMs: 1 })).rejects.toThrow();
      // 1 initial attempt + 3 retries
      expect(calls).toBe(4);
    });
  });

  test("calls onRetry callback on each failure before last attempt", async () => {
    await withFakeTimers(async () => {
      const retryCalls: Array<{ error: unknown; attempt: number }> = [];
      const fn = async () => {
        throw new Error("fail");
      };

      await expect(
        withRetry(fn, "test", {
          maxRetries: 2,
          delayMs: 1,
          onRetry: (error, attempt) => retryCalls.push({ error, attempt }),
        }),
      ).rejects.toThrow();

      // onRetry is called once per retry (not for the final attempt that exhausts)
      expect(retryCalls.length).toBe(2);
      expect(retryCalls[0].attempt).toBe(1);
      expect(retryCalls[1].attempt).toBe(2);
    });
  });

  test("exponential backoff: delay doubles with each attempt", async () => {
    const delays: number[] = [];
    const originalSetTimeoutLocal = globalThis.setTimeout;
    // @ts-expect-error replacing global for test
    globalThis.setTimeout = (cb: () => void, ms: number) => {
      delays.push(ms);
      cb();
      return 0;
    };

    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 4) throw new Error("fail");
      return "done";
    };

    try {
      await withRetry(fn, "test", { maxRetries: 3, delayMs: 100, backoffMultiplier: 2 });
    } finally {
      globalThis.setTimeout = originalSetTimeoutLocal;
    }

    // attempt 1 fails → delay = 100 * 2^0 = 100
    // attempt 2 fails → delay = 100 * 2^1 = 200
    // attempt 3 fails → delay = 100 * 2^2 = 400
    expect(delays).toEqual([100, 200, 400]);
  });

  test("no delay on zero delayMs", async () => {
    const fn = mock(async () => "fast");
    const result = await withRetry(fn, "test", { maxRetries: 1, delayMs: 0 });
    expect(result).toBe("fast");
  });

  test("uses default options when none provided", async () => {
    await withFakeTimers(async () => {
      // Default maxRetries = 3, so fn must fail 4 times to throw
      let calls = 0;
      const fn = async () => {
        calls++;
        throw new Error("fail");
      };

      await expect(withRetry(fn, "test")).rejects.toThrow();
      // 1 initial + 3 retries = 4
      expect(calls).toBe(4);
    });
  });
});
