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

test("admin manages model service and user CRUD flows", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "登录" }).click();

  await page.goto("/providers");
  const rerankRow = page.getByRole("button", { name: /重排模型 · 重排模型服务/ }).locator("xpath=..");
  await rerankRow.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText("重排模型配置已删除。")).toBeVisible();

  await page.getByRole("button", { name: "配置" }).click();
  await page.getByLabel("服务名称").fill("重排模型服务 E2E");
  await page.getByLabel("模型 ID").fill("rerank-e2e-v1");
  await page.getByLabel("Base URL").fill("https://models.example.com/v1");
  await page.getByLabel("API Key").fill("sk-rerank-e2e-1234");
  await page.getByRole("button", { name: "保存并测试" }).click();
  await expect(page.getByText("重排模型已保存，并完成连接测试。")).toBeVisible();
  await expect(page.getByText("重排模型 · 重排模型服务 E2E")).toBeVisible();

  const createdProviderRow = page
    .getByRole("button", { name: /重排模型 · 重排模型服务 E2E/ })
    .locator("xpath=..");
  await createdProviderRow.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("模型 ID").fill("rerank-e2e-v2");
  await page.getByRole("button", { name: "保存并测试" }).click();
  await expect(page.getByText("rerank-e2e-v2")).toBeVisible();

  await page.goto("/users");
  await page.getByRole("button", { name: "新增用户" }).click();
  await page.getByLabel("姓名").fill("自动化用户");
  await page.getByLabel("邮箱").fill("automation@example.com");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("请输入用户密码。")).toBeVisible();
  await page.getByLabel("密码", { exact: true }).fill("automation-secret");
  await page.getByLabel("显示密码").hover();
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("显示密码").dispatchEvent("pointerdown");
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
  await page.evaluate(() => navigator.clipboard.writeText("clipboard-sentinel"));
  await page.getByLabel("密码", { exact: true }).selectText();
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("");
  await page.getByLabel("显示密码").dispatchEvent("pointerup");
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("用户已新增。")).toBeVisible();
  await expect(page.getByText("automation@example.com")).toBeVisible();

  const userRow = page.getByRole("button", { name: /自动化用户/ }).locator("xpath=..");
  await userRow.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("姓名").fill("自动化用户二");
  await page.getByLabel("密码（留空不修改）").fill("automation-reset-secret");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("用户信息已更新。")).toBeVisible();
  await expect(page.getByText("自动化用户二")).toBeVisible();

  await page.getByRole("button", { name: /退出/ }).click();
  await page.getByLabel("邮箱").fill("automation@example.com");
  await page.getByLabel("密码", { exact: true }).fill("automation-secret");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("邮箱或密码不正确，请检查后重试。")).toBeVisible();
  await page.getByLabel("密码", { exact: true }).fill("automation-reset-secret");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("button", { name: /退出/ }).click();
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录" }).click();

  const updatedUserRow = page.getByRole("button", { name: /自动化用户二/ }).locator("xpath=..");
  await updatedUserRow.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText("用户已删除。")).toBeVisible();
  await expect(page.getByText("automation@example.com")).toHaveCount(0);
});

test("document detail links open related task and log details", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登录" }).click();

  await page.goto("/documents/doc-travel-policy");
  await page.getByRole("link", { name: "查看相关任务" }).click();
  await expect(page).toHaveURL(/\/tasks\?selectedId=job-import-001$/);
  await expect(page.getByLabel("详情").getByText("job-import-001")).toBeVisible();

  await page.goto("/documents/doc-travel-policy");
  await page.getByRole("link", { name: "查看日志" }).click();
  await expect(page).toHaveURL(/\/logs\?selectedId=log-import-002$/);
  await expect(page.getByLabel("详情").getByText("log-import-002")).toBeVisible();
});
