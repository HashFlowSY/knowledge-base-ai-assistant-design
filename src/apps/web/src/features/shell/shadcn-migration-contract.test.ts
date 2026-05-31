import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const sourceRoots = ["src/features", "src/app"];
const sourceExtensions = new Set([".ts", ".tsx"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    if (![...sourceExtensions].some((extension) => fullPath.endsWith(extension))) {
      return [];
    }

    return [fullPath];
  });
}

function relativeWebPath(filePath: string): string {
  return filePath.slice(webRoot.length + 1);
}

function readWebSources(): { path: string; source: string }[] {
  return sourceRoots
    .flatMap((root) => collectSourceFiles(join(webRoot, root)))
    .map((filePath) => ({
      path: relativeWebPath(filePath),
      source: readFileSync(filePath, "utf8"),
    }));
}

describe("shadcn migration contract", () => {
  it("keeps business code off legacy features/ui entries", () => {
    const legacyImportPattern = /from\s+["'][.]{1,2}\/ui\//;
    const offenders = readWebSources()
      .filter(({ path }) => !path.startsWith("src/features/ui/"))
      .filter(({ source }) => legacyImportPattern.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("removes legacy UI style files", () => {
    const legacyStyleFiles = [
      "src/features/ui/button-styles.ts",
      "src/features/ui/select-field-styles.ts",
      "src/features/ui/drawer-styles.ts",
    ];

    expect(
      legacyStyleFiles.filter((filePath) => existsSync(join(webRoot, filePath))),
    ).toEqual([]);
  });

  it("keeps form submit types in src/lib", () => {
    expect(existsSync(join(webRoot, "src/lib/form-types.ts"))).toBe(true);
    expect(existsSync(join(webRoot, "src/features/ui/form-types.ts"))).toBe(false);
  });

  it("keeps business UI off legacy visual source classes", () => {
    const legacyVisualPattern =
      /\b(?:bg|text|border|divide|ring|from|to|via|placeholder|file:bg|file:text|hover:bg|hover:text|focus:border|focus:ring|focus-visible:ring|focus-visible:border)-(?:slate|teal|red|blue|yellow)-|\b(?:bg|text|border|ring|from|to|via|placeholder|file:bg|file:text|hover:bg|hover:text|focus:bg|focus:text)-(?:white|black)(?:\/\d+)?\b|rounded-md|focus:border-teal|focus:ring-teal/;
    const offenders = readWebSources()
      .filter(({ path }) => !path.endsWith("shadcn-migration-contract.test.ts"))
      .filter(({ source }) => legacyVisualPattern.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
