import { loadConfig } from "../config/index.ts";
import { createLogger } from "../utils/index.ts";
import { runPipeline } from "./pipeline.ts";

const logger = createLogger("scheduler");

interface CronField {
  readonly minute: number;
  readonly hour: number;
  readonly dayOfMonth: number | "*";
  readonly month: number | "*";
  readonly dayOfWeek: number | "*";
}

function parseCronSchedule(cron: string): CronField {
  const parts = cron.split(" ");
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  return {
    minute: parts[0] === "*" ? -1 : Number(parts[0]),
    hour: parts[1] === "*" ? -1 : Number(parts[1]),
    dayOfMonth: parts[2] === "*" ? "*" : Number(parts[2]),
    month: parts[3] === "*" ? "*" : Number(parts[3]),
    dayOfWeek: parts[4] === "*" ? "*" : Number(parts[4]),
  };
}

function matchesCron(cron: CronField, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  if (cron.minute !== -1 && cron.minute !== minute) return false;
  if (cron.hour !== -1 && cron.hour !== hour) return false;
  if (cron.dayOfMonth !== "*" && cron.dayOfMonth !== dayOfMonth) return false;
  if (cron.month !== "*" && cron.month !== month) return false;
  if (cron.dayOfWeek !== "*" && cron.dayOfWeek !== dayOfWeek) return false;

  return true;
}

function getNextRunTime(cron: CronField): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);

  for (let i = 0; i < 1440; i++) {
    next.setMinutes(next.getMinutes() + 1);
    if (matchesCron(cron, next)) return next;
  }

  throw new Error("Could not determine next run time within 24 hours");
}

export async function startScheduler(): Promise<void> {
  const config = loadConfig();
  const cronField = parseCronSchedule(config.pipeline.cronSchedule);

  logger.info(`Scheduler started with cron: ${config.pipeline.cronSchedule}`);

  const nextRun = getNextRunTime(cronField);
  logger.info(`Next run scheduled at: ${nextRun.toISOString()}`);

  const CHECK_INTERVAL_MS = 60_000;

  const checkAndRun = async (): Promise<void> => {
    const now = new Date();
    if (matchesCron(cronField, now)) {
      logger.info("Cron match — starting pipeline");
      try {
        await runPipeline(config);
      } catch (error) {
        logger.error("Pipeline run failed", error);
      }
    }
  };

  setInterval(checkAndRun, CHECK_INTERVAL_MS);
  logger.info("Scheduler is running. Press Ctrl+C to stop.");
}

if (import.meta.main) {
  startScheduler().catch((error) => {
    logger.error("Scheduler crashed", error);
    process.exit(1);
  });
}
