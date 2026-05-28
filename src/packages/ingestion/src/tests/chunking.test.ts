import { describe, expect, it } from "vitest";

import { chunkParsedDocument, parseDocument } from "../index";

describe("@kb/ingestion chunking", () => {
  it("chunks Markdown by preferring headings and paragraph boundaries", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(
        "# Intro\n\nThis paragraph explains the upload pipeline.\n\n## Details\n\n- Parse files\n- Chunk text\n- Embed chunks",
      ),
      mimeType: "text/markdown",
      originalFilename: "notes.md",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 10,
      chunkSize: 60,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "# Intro\n\nThis paragraph explains the upload pipeline.",
      "pipeline.\n\n## Details\n\n- Parse files\n- Chunk text",
      "Chunk text\n- Embed chunks",
    ]);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
    expect(chunks.every((chunk) => chunk.contentHash.length === 64)).toBe(true);
  });

  it("chunks TXT by preferring paragraph and sentence boundaries", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(
        "First sentence. Second sentence stays nearby.\n\nA new paragraph should start cleanly when possible.",
      ),
      mimeType: "text/plain",
      originalFilename: "notes.txt",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 8,
      chunkSize: 55,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "First sentence. Second sentence stays nearby.",
      "nearby.\n\nA new paragraph should start cleanly when",
      "cleanly when possible.",
    ]);
  });

  it("falls back to hard character limits with overlap for long unbroken text", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode("abcdefghijklmnopqrstuvwxyz"),
      mimeType: "text/plain",
      originalFilename: "letters.txt",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 4,
      chunkSize: 10,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "abcdefghij",
      "ghijklmnop",
      "mnopqrstuv",
      "stuvwxyz",
    ]);
  });
});
