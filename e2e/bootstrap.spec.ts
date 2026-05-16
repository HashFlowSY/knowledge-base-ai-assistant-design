import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

test("logs in and renders implemented route smoke set", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("heading", { name: "知识库工作台" })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace$/);

  const routes = [
    ["/chat", "问答"],
    ["/documents", "文档列表"],
    ["/tasks", "任务队列"],
    ["/logs", "处理日志"],
    ["/providers", "模型服务"],
    ["/users", "用户管理"],
    ["/audit", "审计日志"],
    ["/unauthorized", "无权访问此页面"],
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("runs the core mock happy path", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登录" }).click();

  await page.getByRole("button", { name: "新建知识库" }).click();
  await page.getByLabel("知识库名称").fill("采购合同知识库");
  await page.getByLabel("描述").fill("供应商合同与采购条款");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("采购合同知识库")).toBeVisible();

  await page.getByRole("button", { name: "上传文件" }).click();
  await page.getByLabel("文件名").fill("供应商准入规范.pdf");
  await page.getByRole("button", { name: "提交上传" }).click();
  await expect(page.getByText("供应商准入规范.pdf")).toBeVisible();

  await page.goto("/chat");
  await page.getByPlaceholder("例如：差旅住宿标准是多少？").fill("差旅住宿标准是多少？");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByText("可在右侧引用中核验来源。")).toBeVisible();
  await page.getByRole("button", { name: "有帮助" }).click();
  await expect(page.getByText("反馈已提交")).toBeVisible();
  await page.getByRole("link", { name: "打开相关文档" }).click();
  await expect(page).toHaveURL(/\/documents\/doc-travel-policy\?chunkId=chunk-travel-001/);
  await expect(page.getByRole("heading", { name: "差旅报销管理办法 2026" })).toBeVisible();
});

test("member can view tasks but cannot access admin-only routes directly", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("member@example.com");
  await page.getByRole("button", { name: "登录" }).click();

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "任务队列" })).toBeVisible();
  await expect(page.getByRole("link", { name: /任务/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /重试/ }).first()).toBeDisabled();

  await page.goto("/providers");
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByRole("heading", { name: "无权访问此页面" })).toBeVisible();
  await expect(page.getByRole("link", { name: "模型服务" })).toHaveCount(0);
});
