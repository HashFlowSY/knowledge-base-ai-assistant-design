import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("@kb/ingestion module structure", () => {
  it("keeps implementation files grouped by ingestion responsibility", () => {
    const expectedFiles = [
      "contracts/errors.ts",
      "contracts/schemas.ts",
      "contracts/types.ts",
      "parsing/parser.ts",
      "parsing/pdf.ts",
      "parsing/text.ts",
      "chunking/chunker.ts",
      "chunking/boundaries.ts",
      "pipeline/pipeline.ts",
      "pipeline/embedding-batches.ts",
      "pipeline/steps.ts",
      "repositories/drizzle.ts",
      "repositories/mappers.ts",
      "recovery/recovery.ts",
    ];

    expect(
      expectedFiles.filter((filePath) => !existsSync(resolve(sourceRoot, filePath))),
    ).toEqual([]);
  });

  it("keeps the ingestion root limited to public entry and functional directories", () => {
    const rootEntries = readdirSync(sourceRoot).sort();

    expect(rootEntries).toEqual([
      "chunking",
      "contracts",
      "index.ts",
      "parsing",
      "pipeline",
      "recovery",
      "repositories",
      "tests",
    ]);
  });

  it("keeps the public entrypoint as a small barrel", () => {
    const source = readFileSync(resolve(sourceRoot, "index.ts"), "utf8");

    expect(source.split("\n").length).toBeLessThanOrEqual(12);
    expect(source).not.toContain("function ");
    expect(source).not.toContain("class ");
  });
});
