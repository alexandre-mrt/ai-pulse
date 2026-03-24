import { runPipeline } from "./scheduler/pipeline.ts";
import { createLogger } from "./utils/index.ts";

const logger = createLogger("main");

const args = process.argv.slice(2);
const command = args[0] ?? "run";

async function main(): Promise<void> {
  logger.info("AI Pulse — Automated AI/Tech Content Pipeline");

  switch (command) {
    case "run": {
      logger.info("Running pipeline once");
      await runPipeline();
      break;
    }
    case "schedule": {
      logger.info("Starting scheduler");
      const { startScheduler } = await import("./scheduler/cron.ts");
      await startScheduler();
      break;
    }
    case "dashboard": {
      logger.info("Dashboard: run 'bun run dashboard' separately");
      break;
    }
    default: {
      logger.error(`Unknown command: ${command}`);
      console.log("Usage: bun run src/index.ts [run|schedule|dashboard]");
      process.exit(1);
    }
  }
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
