import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createLogger } from "../../src/utils/logger";

describe("createLogger", () => {
  test("returns object with debug, info, warn, error methods", () => {
    const logger = createLogger("test");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  test("info method calls console.log", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("test-ctx");
    logger.info("hello world");

    console.log = originalLog;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain("hello world");
  });

  test("warn method calls console.warn", () => {
    const originalWarn = console.warn;
    const calls: string[] = [];
    console.warn = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("test-ctx");
    logger.warn("something fishy");

    console.warn = originalWarn;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain("something fishy");
  });

  test("error method calls console.error", () => {
    const originalError = console.error;
    const calls: string[] = [];
    console.error = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("test-ctx");
    logger.error("fatal issue");

    console.error = originalError;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain("fatal issue");
  });

  test("log output includes the context label", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("my-module");
    logger.info("test message");

    console.log = originalLog;
    expect(calls[0]).toContain("my-module");
  });

  test("log output includes level in uppercase", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("ctx");
    logger.info("level check");

    console.log = originalLog;
    expect(calls[0]).toContain("INFO");
  });

  test("log output includes serialized data when provided", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("ctx");
    logger.info("with data", { key: "value" });

    console.log = originalLog;
    expect(calls[0]).toContain('"key"');
    expect(calls[0]).toContain('"value"');
  });

  test("log output contains an ISO timestamp", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const before = Date.now();
    const logger = createLogger("ctx");
    logger.info("ts check");
    const after = Date.now();

    console.log = originalLog;
    // ISO timestamp format: 2024-01-01T00:00:00.000Z
    expect(calls[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("log level filtering", () => {
  // Note: LOG_LEVEL is read at module load time from process.env.
  // The currentLevel constant is set once when the module is first imported.
  // We test the filtering logic by checking that the shouldLog guard works
  // for messages at or above the configured level.
  //
  // Since process.env.LOG_LEVEL is evaluated at import time, we verify
  // the default behavior (LOG_LEVEL=info): info/warn/error should pass,
  // debug should be suppressed.

  test("debug is suppressed when LOG_LEVEL is info (default)", () => {
    // Default LOG_LEVEL is 'info', so debug should not call console.log
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("filter-test");
    logger.debug("should be hidden");

    console.log = originalLog;
    expect(calls.length).toBe(0);
  });

  test("info is emitted when LOG_LEVEL is info (default)", () => {
    const originalLog = console.log;
    const calls: string[] = [];
    console.log = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("filter-test");
    logger.info("should be visible");

    console.log = originalLog;
    expect(calls.length).toBeGreaterThan(0);
  });

  test("warn is emitted when LOG_LEVEL is info (default)", () => {
    const originalWarn = console.warn;
    const calls: string[] = [];
    console.warn = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("filter-test");
    logger.warn("should be visible");

    console.warn = originalWarn;
    expect(calls.length).toBeGreaterThan(0);
  });

  test("error is emitted when LOG_LEVEL is info (default)", () => {
    const originalError = console.error;
    const calls: string[] = [];
    console.error = (msg: string) => {
      calls.push(msg);
    };

    const logger = createLogger("filter-test");
    logger.error("should be visible");

    console.error = originalError;
    expect(calls.length).toBeGreaterThan(0);
  });
});
