import { IngestionError } from "../contracts/errors";
import type { PdfTextExtractionResult } from "../contracts/types";

interface PdfParseResult {
  text: string;
  sourcePageCount?: number;
  metadata?: Record<string, unknown>;
}

interface PdfParseV2Instance {
  getText(): Promise<{
    text: string;
    total?: number;
    metadata?: Record<string, unknown>;
  }>;
  destroy(): Promise<void> | void;
}

export async function defaultPdfTextExtractor(
  body: Uint8Array,
): Promise<PdfTextExtractionResult> {
  const module = (await import("pdf-parse")) as unknown;
  const pdfParse = resolvePdfParseFunction(module);
  const result = await pdfParse(Buffer.from(body));

  return {
    ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result.sourcePageCount === undefined
      ? {}
      : { sourcePageCount: result.sourcePageCount }),
    text: result.text,
  };
}

function resolvePdfParseFunction(
  module: unknown,
): (body: Uint8Array) => Promise<PdfParseResult> {
  if (typeof module === "function") {
    return async (body) => normalizePdfParseResult(await module(body));
  }

  if (
    typeof module === "object" &&
    module !== null &&
    "default" in module &&
    typeof module.default === "function"
  ) {
    const parser = module.default;
    return async (body) => normalizePdfParseResult(await parser(body));
  }

  if (
    typeof module === "object" &&
    module !== null &&
    "PDFParse" in module &&
    typeof module.PDFParse === "function"
  ) {
    const PDFParse = module.PDFParse as new (input: {
      data: Uint8Array;
    }) => PdfParseV2Instance;
    return async (body) => {
      const parser = new PDFParse({ data: body });
      try {
        const result = await parser.getText();
        return {
          ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
          ...(result.total === undefined ? {} : { sourcePageCount: result.total }),
          text: result.text,
        };
      } finally {
        await parser.destroy();
      }
    };
  }

  throw new IngestionError({
    code: "UNSUPPORTED_DOCUMENT_TYPE",
    message: "PDF parser is unavailable.",
    retryable: true,
  });
}

function normalizePdfParseResult(value: unknown): PdfParseResult {
  if (typeof value !== "object" || value === null || !("text" in value)) {
    throw new IngestionError({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      message: "PDF parser returned an invalid result.",
      retryable: true,
    });
  }

  const result = value as {
    text: unknown;
    numpages?: unknown;
    total?: unknown;
    metadata?: unknown;
  };
  if (typeof result.text !== "string") {
    throw new IngestionError({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      message: "PDF parser returned an invalid result.",
      retryable: true,
    });
  }

  const sourcePageCount =
    typeof result.numpages === "number"
      ? result.numpages
      : typeof result.total === "number"
        ? result.total
        : undefined;

  return {
    ...(isRecord(result.metadata) ? { metadata: result.metadata } : {}),
    ...(sourcePageCount === undefined ? {} : { sourcePageCount }),
    text: result.text,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
