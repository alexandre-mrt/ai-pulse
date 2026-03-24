import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// We need to mock global fetch before importing the module under test.
// Bun:test does not support module-level mock.module in all versions,
// so we stub globalThis.fetch directly.

const originalFetch = globalThis.fetch;

function makeMockResponse(
  body: string,
  status = 200,
  statusText = "OK",
): Response {
  return new Response(body, { status, statusText });
}

function makeAbortingFetch(): typeof fetch {
  // Returns a fetch that throws an AbortError to simulate timeout
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new DOMException("The operation was aborted.", "AbortError");
          reject(err);
        });
      }
      // Never resolves — waits for the signal to fire
    });
  };
}

describe("fetchWithTimeout", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns response when fetch succeeds", async () => {
    globalThis.fetch = async () => makeMockResponse("hello");

    const { fetchWithTimeout } = await import("../../src/utils/http");
    const res = await fetchWithTimeout("https://example.com/api");
    expect(res.status).toBe(200);
  });

  test("throws on non-ok HTTP status", async () => {
    globalThis.fetch = async () => makeMockResponse("Not Found", 404, "Not Found");

    const { fetchWithTimeout } = await import("../../src/utils/http");
    await expect(fetchWithTimeout("https://example.com/missing")).rejects.toThrow("HTTP 404");
  });

  test("throws timeout error when request exceeds timeout", async () => {
    globalThis.fetch = makeAbortingFetch();

    const { fetchWithTimeout } = await import("../../src/utils/http");
    await expect(
      fetchWithTimeout("https://example.com/slow", { timeout: 10 }),
    ).rejects.toThrow(/timeout/i);
  });

  test("re-throws non-abort errors unchanged", async () => {
    globalThis.fetch = async () => {
      throw new Error("network failure");
    };

    const { fetchWithTimeout } = await import("../../src/utils/http");
    await expect(fetchWithTimeout("https://example.com/api")).rejects.toThrow("network failure");
  });
});

describe("getDomain extraction (via rate limiting path)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("rate limiting uses domain extracted from URL", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL) => {
      calls.push(input.toString());
      return makeMockResponse("ok");
    };

    const { fetchWithTimeout } = await import("../../src/utils/http");

    // Two requests to same domain with 1 req/second limit
    // We only verify both complete without error — the domain grouping is internal
    await fetchWithTimeout("https://rate-test.example.com/a", {
      rateLimit: { requestsPerSecond: 100 },
    });
    await fetchWithTimeout("https://rate-test.example.com/b", {
      rateLimit: { requestsPerSecond: 100 },
    });

    expect(calls.length).toBe(2);
  });

  test("different domains are not rate-limited against each other", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL) => {
      calls.push(input.toString());
      return makeMockResponse("ok");
    };

    const { fetchWithTimeout } = await import("../../src/utils/http");

    const start = Date.now();
    await fetchWithTimeout("https://domain-a.com/path", {
      rateLimit: { requestsPerSecond: 1 },
    });
    await fetchWithTimeout("https://domain-b.com/path", {
      rateLimit: { requestsPerSecond: 1 },
    });
    const elapsed = Date.now() - start;

    // Different domains: no inter-domain waiting expected
    expect(calls.length).toBe(2);
    // Should complete quickly (well under 1s) since domains differ
    expect(elapsed).toBeLessThan(500);
  });
});

describe("fetchJson", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("parses JSON response body", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ value: 42 }), { status: 200 });

    const { fetchJson } = await import("../../src/utils/http");
    const data = await fetchJson<{ value: number }>("https://example.com/json");
    expect(data.value).toBe(42);
  });
});

describe("fetchText", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns response text body", async () => {
    globalThis.fetch = async () => new Response("plain text", { status: 200 });

    const { fetchText } = await import("../../src/utils/http");
    const text = await fetchText("https://example.com/text");
    expect(text).toBe("plain text");
  });
});
