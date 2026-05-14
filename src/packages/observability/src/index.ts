import { createUtcTimestamp, type ServiceName } from "@kb/shared";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  jobId?: string;
  tenantId?: string;
  actorId?: string;
  knowledgeBaseId?: string;
  documentId?: string;
  action?: string;
  service?: ServiceName;
}

export interface LogRecord extends LogContext {
  timestamp: string;
  level: LogLevel;
  event: string;
  fields: Record<string, unknown>;
}

export interface Logger {
  child(context: LogContext): Logger;
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export type LogSink = (record: LogRecord) => void;

const secretLikeKeys = new Set([
  "authorization",
  "cookie",
  "databaseUrl",
  "redisUrl",
  "meilisearchMasterKey",
  "accessKeyId",
  "secretAccessKey",
  "betterAuthSecret",
  "appEncryptionKey",
  "providerApiKey",
]);

export function redactLogFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      secretLikeKeys.has(key) ? "[REDACTED]" : value,
    ]),
  );
}

export function createLogger(context: LogContext = {}, sink?: LogSink): Logger {
  const write: LogSink =
    sink ??
    (() => {
      // Intentionally empty for bootstrap. Runtime tasks will wire a console or collector sink.
    });

  const emit = (
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
  ): void => {
    write({
      ...context,
      timestamp: createUtcTimestamp(),
      level,
      event,
      fields: redactLogFields(fields),
    });
  };

  return {
    child(childContext: LogContext): Logger {
      return createLogger({ ...context, ...childContext }, write);
    },
    debug(event, fields) {
      emit("debug", event, fields);
    },
    info(event, fields) {
      emit("info", event, fields);
    },
    warn(event, fields) {
      emit("warn", event, fields);
    },
    error(event, fields) {
      emit("error", event, fields);
    },
  };
}
