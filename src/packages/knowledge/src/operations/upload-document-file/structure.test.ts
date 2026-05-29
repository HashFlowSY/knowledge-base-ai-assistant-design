import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function findRepoRoot(start: string): string {
  let current = start;

  while (!existsSync(resolve(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repository root.");
    }
    current = parent;
  }

  return current;
}

const repoRoot = findRepoRoot(import.meta.dirname);
const uploadOperationRoot = resolve(
  repoRoot,
  "src/packages/knowledge/src/operations/upload-document-file",
);

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("document upload operation module structure", () => {
  it("keeps the upload operation split by functional responsibility", () => {
    const expectedFiles = [
      "access/authorization.ts",
      "index.ts",
      "lifecycle/failures.ts",
      "lifecycle/finalization.ts",
      "metadata/reservation.ts",
      "metadata/results.ts",
      "observability/audit.ts",
      "shared/constants.ts",
      "shared/types.ts",
    ];

    for (const fileName of expectedFiles) {
      expect(existsSync(resolve(uploadOperationRoot, fileName))).toBe(true);
    }

    const rootFileNames = readdirSync(uploadOperationRoot, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(rootFileNames).toEqual(["index.ts", "structure.test.ts"]);
  });

  it("keeps the legacy upload operation entry as a thin compatibility wrapper", () => {
    const legacySource = readProjectFile(
      "src/packages/knowledge/src/operations/upload-document-file.ts",
    );
    const implementationLines = legacySource
      .split("\n")
      .filter((line) => line.trim().length > 0);

    expect(implementationLines.length).toBeLessThanOrEqual(20);
    expect(legacySource).toContain('from "./upload-document-file/index"');
  });
});
