import { IngestionError } from "../contracts/errors";
import {
  parsedDocumentSchema,
  type ParsedDocument,
  type ParsedDocumentFormat,
} from "../contracts/schemas";
import type { ParseDocumentInput } from "../contracts/types";
import { defaultPdfTextExtractor } from "./pdf";
import { normalizeParsedText } from "./text";

const minimumPdfTextCharacters = 5;

export async function parseDocument(
  input: ParseDocumentInput,
): Promise<ParsedDocument> {
  const format = detectDocumentFormat(input);

  if (format === "pdf") {
    const extractor = input.pdfTextExtractor ?? defaultPdfTextExtractor;
    const extracted = await extractor(input.body);
    const text = normalizeParsedText(extracted.text);
    if (text.length < minimumPdfTextCharacters) {
      throw new IngestionError({
        code: "PARSE_EMPTY_TEXT",
        message: "PDF did not contain extractable text.",
        retryable: false,
      });
    }

    return parsedDocumentSchema.parse({
      format,
      text,
      metadata: extracted.metadata ?? {},
      ...(extracted.sourcePageCount === undefined
        ? {}
        : { sourcePageCount: extracted.sourcePageCount }),
      ...(input.originalFilename === null || input.originalFilename === undefined
        ? {}
        : { title: input.originalFilename }),
    });
  }

  const text = normalizeParsedText(new TextDecoder("utf-8").decode(input.body));
  return parsedDocumentSchema.parse({
    format,
    text,
    metadata: {},
    ...(input.originalFilename === null || input.originalFilename === undefined
      ? {}
      : { title: input.originalFilename }),
  });
}

function detectDocumentFormat(input: ParseDocumentInput): ParsedDocumentFormat {
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const filename = input.originalFilename?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    mimeType === "text/markdown" ||
    mimeType === "text/x-markdown" ||
    filename.endsWith(".md") ||
    filename.endsWith(".markdown")
  ) {
    return "markdown";
  }

  if (mimeType === "text/plain" || filename.endsWith(".txt")) {
    return "txt";
  }

  throw new IngestionError({
    code: "UNSUPPORTED_DOCUMENT_TYPE",
    message: "Document type is not supported by ingestion.",
    retryable: false,
  });
}
