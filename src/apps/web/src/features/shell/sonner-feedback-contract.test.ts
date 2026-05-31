import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    if (!sourceExtensions.has(extname(entry)) || entry.endsWith(".test.ts")) {
      return [];
    }

    return [fullPath];
  });
}

describe("Sonner feedback contract", () => {
  it("mounts the shadcn Sonner toaster globally", () => {
    const providersSource = readFileSync(
      join(webRoot, "src/features/api/app-providers.tsx"),
      "utf8",
    );

    expect(providersSource).toContain("import { Toaster } from \"@/components/ui/sonner\"");
    expect(providersSource).toContain("<Toaster />");
  });

  it("keeps success feedback out of inline page notices", () => {
    const offenders = collectSourceFiles(join(webRoot, "src/features"))
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");

        return source.includes("<Notice tone=\"success\"");
      })
      .map((filePath) => filePath.slice(webRoot.length + 1));

    expect(offenders).toEqual([]);
  });

  it("routes successful mutation feedback through Sonner", () => {
    const feedbackEntryFiles = [
      "src/features/admin/providers-page.tsx",
      "src/features/admin/users-page.tsx",
      "src/features/workspace/workspace-page.tsx",
    ];

    for (const filePath of feedbackEntryFiles) {
      const source = readFileSync(join(webRoot, filePath), "utf8");

      expect(source, filePath).toContain("import { toast } from \"sonner\"");
      expect(source, filePath).toContain("toast.success(message)");
    }
  });
});
