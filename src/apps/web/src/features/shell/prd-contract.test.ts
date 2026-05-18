import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function findRepoRoot(start: string): string {
  let current = start;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, ".trellis"))) {
      return current;
    }
    current = dirname(current);
  }

  throw new Error("Unable to locate repo root for PRD contract test.");
}

function readFrontendPrd(): string {
  const root = findRepoRoot(process.cwd());
  return readFileSync(
    resolve(root, ".trellis/tasks/archive/2026-05/05-15-frontend-page-design/prd.md"),
    "utf8",
  );
}

describe("frontend PRD executable contract", () => {
  it("keeps provider model scope aligned with the current CRUD-only model service design", () => {
    const prd = readFrontendPrd();

    expect(prd).toContain(
      "The model service page keeps only three model types: chat model, embedding model, and rerank model.",
    );
    expect(prd).toContain("Saving a model service config automatically runs a connection test");
    expect(prd).toContain(
      "The model service page does not provide standby models, set-as-default, separate enable/disable, or separate key-rotation actions.",
    );
    expect(prd).not.toContain("模型服务页面仅保留三类模型");
    expect(prd).not.toContain("保存模型配置时自动执行一次连接测试");
    expect(prd).not.toContain("模型服务不提供备用模型");
    expect(prd).not.toContain("isDefault");
    expect(prd).not.toContain("provider.rotate_key");
    expect(prd).not.toContain("provider.set_default");
  });

  it("keeps user management aligned with CRUD instead of invite flows", () => {
    const prd = readFrontendPrd();

    expect(prd).toContain("Invitation flows are removed from user management.");
    expect(prd).toContain("User management implements CRUD through add, view, edit, and delete.");
    expect(prd).not.toContain("用户管理取消邀请用户功能");
    expect(prd).not.toContain("用户管理通过新增、查看、编辑、删除实现 CRUD");
    expect(prd).not.toContain("user.invite");
    expect(prd).not.toContain("invite/add user");
  });
});
