import { describe, expect, it } from "vitest";

import { canShowWorkspaceProcessingLogs } from "./workspace-permissions";

describe("workspace permissions", () => {
  it("shows processing log summaries only to admin users", () => {
    expect(canShowWorkspaceProcessingLogs("admin")).toBe(true);
    expect(canShowWorkspaceProcessingLogs("member")).toBe(false);
    expect(canShowWorkspaceProcessingLogs(null)).toBe(false);
  });
});
