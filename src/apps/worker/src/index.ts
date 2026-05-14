import { startWorkerRuntime } from "./lifecycle";

const runtime = await startWorkerRuntime();

const shutdown = async (reason: string): Promise<void> => {
  await runtime.stop(reason);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
