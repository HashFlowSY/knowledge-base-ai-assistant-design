import type { IngestionErrorCode } from "./schemas";

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly retryable: boolean;

  constructor(input: {
    code: IngestionErrorCode;
    message: string;
    retryable: boolean;
  }) {
    super(input.message);
    this.name = "IngestionError";
    this.code = input.code;
    this.retryable = input.retryable;
  }
}
