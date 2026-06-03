import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scrollAreaSource = readFileSync(
  fileURLToPath(new URL("./scroll-area.tsx", import.meta.url)),
  "utf8",
);

describe("ScrollArea source contract", () => {
  it("exposes the Radix viewport ref so feature code scrolls the real scrollbar owner", () => {
    expect(scrollAreaSource).toContain("viewportRef");
    expect(scrollAreaSource).toContain("ref={viewportRef}");
  });
});
