import { describe, expect, it } from "vitest";

import {
  IngestionError,
  normalizeParsedText,
  parseDocument,
} from "../index";

describe("@kb/ingestion parsing", () => {
  it("normalizes line endings and excessive blank lines deterministically", () => {
    expect(normalizeParsedText("One\r\n\r\n\r\nTwo\rThree  \n")).toBe(
      "One\n\nTwo\nThree",
    );
  });

  it("fails empty text-layer PDFs without falling back to OCR", async () => {
    await expect(
      parseDocument({
        body: new Uint8Array([37, 80, 68, 70]),
        mimeType: "application/pdf",
        originalFilename: "scan.pdf",
        pdfTextExtractor: async () => ({
          sourcePageCount: 2,
          text: "   \n",
        }),
      }),
    ).rejects.toMatchObject({
      code: "PARSE_EMPTY_TEXT",
      retryable: false,
    });
  });

  it("extracts text-layer PDFs with the bundled pdf parser", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(textLayerPdfFixture),
      mimeType: "application/pdf",
      originalFilename: "text-layer.pdf",
    });

    expect(parsed.format).toBe("pdf");
    expect(parsed.text).toContain("Hello PDF text");
    expect(parsed.sourcePageCount).toBe(1);
  });

  it("rejects unsupported document types before expensive parsing", async () => {
    await expect(
      parseDocument({
        body: new TextEncoder().encode("<html></html>"),
        mimeType: "text/html",
        originalFilename: "source.html",
      }),
    ).rejects.toBeInstanceOf(IngestionError);
    await expect(
      parseDocument({
        body: new TextEncoder().encode("<html></html>"),
        mimeType: "text/html",
        originalFilename: "source.html",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      retryable: false,
    });
  });
});

const textLayerPdfFixture = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 72 720 Td (Hello PDF text) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000311 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`;
