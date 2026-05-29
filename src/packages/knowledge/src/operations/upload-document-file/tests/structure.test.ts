import { existsSync, readdirSync } from "node:fs";
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
const operationsRoot = resolve(repoRoot, "src/packages/knowledge/src/operations");

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

    expect(rootFileNames).toEqual(["index.ts"]);
  });

  it("keeps operation roots grouped by feature directories", () => {
    const operationRootFiles = readdirSync(operationsRoot, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(operationRootFiles).toEqual([]);
    expect(
      existsSync(
        resolve(
          repoRoot,
          "src/packages/knowledge/src/operations/upload-document-file.ts",
        ),
      ),
    ).toBe(false);
  });
});
