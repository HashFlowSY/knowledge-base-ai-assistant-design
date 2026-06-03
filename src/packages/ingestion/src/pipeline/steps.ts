import { IngestionError } from "../contracts/errors";
import type { PersistedIngestionStep } from "../contracts/schemas";
import type {
  FileIngestionJobContext,
  IngestionPipelineRepository,
  IngestionStepLogStatus,
} from "../contracts/types";

export async function recordStep(
  repository: IngestionPipelineRepository,
  context: FileIngestionJobContext,
  step: PersistedIngestionStep,
  status: IngestionStepLogStatus,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await repository.recordStep({
    ingestionJobId: context.ingestionJobId,
    message: `${step}.${status}`,
    metadata,
    status,
    step,
    tenantId: context.tenantId,
  });
}

export async function failPipelineJob(
  repository: IngestionPipelineRepository,
  context: FileIngestionJobContext,
  input: {
    code: string;
    message: string;
    retryable: boolean;
    shouldRetry: boolean;
    step?: PersistedIngestionStep;
  },
): Promise<void> {
  if (input.step !== undefined) {
    await repository.recordStep({
      errorCode: input.code,
      ingestionJobId: context.ingestionJobId,
      message: input.message,
      metadata: {
        retryable: input.retryable,
        shouldRetry: input.shouldRetry,
      },
      status: "failed",
      step: input.step,
      tenantId: context.tenantId,
    });
  }

  await repository.failJob({
    documentVersion: context.documentVersion,
    errorCode: input.code,
    errorMessage: input.message,
    ingestionJobId: context.ingestionJobId,
    retryable: input.retryable,
    shouldRetry: input.shouldRetry,
  });
}

export function shouldRetryPipelineFailure(
  context: FileIngestionJobContext,
  retryable: boolean,
): boolean {
  return retryable && context.attempts < context.maxAttempts;
}

export function normalizePipelineError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof IngestionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INGESTION_FAILED",
      message: error.message,
      retryable: true,
    };
  }

  return {
    code: "INGESTION_FAILED",
    message: String(error),
    retryable: true,
  };
}
