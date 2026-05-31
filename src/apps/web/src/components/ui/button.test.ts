import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const buttonSource = readFileSync(
  fileURLToPath(new URL("./button.tsx", import.meta.url)),
  "utf8",
);

describe("Button source contract", () => {
  it("keeps asChild Slot children to one direct React element", () => {
    expect(buttonSource).toContain("const content = asChild ?");
    expect(buttonSource).toContain("{content}\n    </Comp>");
  });
});
