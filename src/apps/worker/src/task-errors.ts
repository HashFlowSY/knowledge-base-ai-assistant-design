import { isAppError } from "@kb/errors";

const safeWorkerTaskErrorMessage = "Worker task failed.";

export function createWorkerTaskErrorFields(
  taskName: string,
  error: unknown,
): Record<string, unknown> {
  if (isAppError(error)) {
    const appError = error.data;
    return {
      code: appError.code,
      httpStatus: appError.httpStatus,
      domain: appError.domain,
      reason: appError.reason,
      retryable: appError.retryable ?? false,
      ...(appError.metadata === undefined
        ? {}
        : { metadata: appError.metadata }),
      error: error.message,
      stack: error.stack ?? "",
    };
  }

  if (error instanceof Error) {
    return {
      taskName,
      error: safeWorkerTaskErrorMessage,
      stack: createSafeWorkerTaskStack(error),
    };
  }

  return {
    taskName,
    error: safeWorkerTaskErrorMessage,
    stack: "",
  };
}

function createSafeWorkerTaskStack(error: Error): string {
  const frames =
    error.stack
      ?.split("\n")
      .filter((line) => line.trimStart().startsWith("at ")) ?? [];

  return ["Error: Worker task failed.", ...frames].join("\n");
}
