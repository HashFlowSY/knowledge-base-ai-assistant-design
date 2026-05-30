import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function findRepoRoot(start: string): string {
  let current = start;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, ".trellis"))) {
      return current;
    }
    current = dirname(current);
  }

  throw new Error("Unable to locate repo root for frontend mock contract test.");
}

const repoRoot = findRepoRoot(process.cwd());
const webSourceRoot = resolve(repoRoot, "src/apps/web/src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const forbiddenPatterns = [
  "features/mock",
  "../mock",
  "MockDataBoundary",
  "MockStoreProvider",
  "useMockStore",
  "MockState",
  "MockAction",
  "mockStoreReducer",
  "createSeedMockState",
  "MOCK_STORAGE_KEY",
] as const;

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (!sourceExtensions.has(extname(entry)) || entry.endsWith(".test.ts")) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

describe("frontend mock removal contract", () => {
  it("does not keep frontend mock modules, routes, or production imports", () => {
    const deletedPaths = [
      "src/apps/web/src/features/mock",
      "src/apps/web/src/app/documents",
      "src/apps/web/src/app/tasks",
      "src/apps/web/src/app/logs",
    ];

    for (const deletedPath of deletedPaths) {
      expect(existsSync(resolve(repoRoot, deletedPath)), deletedPath).toBe(false);
    }

    const offenders = listSourceFiles(webSourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");

      return forbiddenPatterns
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${relative(repoRoot, filePath)} contains ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });
});
