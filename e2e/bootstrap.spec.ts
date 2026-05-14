import { expect, test } from "@playwright/test";

test("renders the bootstrap status page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "知识库 AI 助手" })).toBeVisible();
  await expect(page.getByText("Hono 服务提供基础健康检查。")).toBeVisible();
});
