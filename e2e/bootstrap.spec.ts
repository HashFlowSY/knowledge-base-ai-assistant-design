import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

test("redirects unauthenticated root visits to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("admin login renders the workspace heading", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByRole("heading", { name: "知识库工作台" })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace(?:\?.*)?$/);
});

test("workspace knowledge-base flows follow real permissions and URL state", async ({ page }) => {
  const suffix = Date.now().toString();
  const adminOnlyName = `管理员专用知识库 ${suffix}`;
  const draftName = `协作知识库 ${suffix}`;
  const finalName = `协作知识库 成员版 ${suffix}`;
  const finalDescription = `更新后的描述 ${suffix}`;

  await page.goto("/login");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByRole("heading", { name: "知识库工作台" })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace(?:\?.*)?$/);

  await expect(page.getByRole("button", { name: "新建知识库" })).toBeVisible();
  await expect(page.getByRole("button", { name: "删除" })).toHaveCount(0);

  await page.getByRole("button", { name: "新建知识库" }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("知识库名称").fill(adminOnlyName);
  await createDialog.getByLabel("描述").fill(`仅管理员可见 ${suffix}`);
  await expect(createDialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await createDialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("知识库已创建。")).toBeVisible();
  await expect(page.getByText(adminOnlyName)).toBeVisible();
  await expect(page.getByText(`仅管理员可见 ${suffix}`)).toBeVisible();

  await page.getByRole("button", { name: "新建知识库" }).click();
  await page.getByRole("dialog").getByLabel("知识库名称").fill(draftName);
  await page.getByRole("dialog").getByLabel("描述").fill(`待协作知识库 ${suffix}`);
  await page.getByRole("dialog").getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("知识库已创建。")).toBeVisible();
  await expect(page.getByText(draftName)).toBeVisible();

  await page.getByRole("button", { name: "编辑知识库" }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("知识库名称").fill(finalName);
  await editDialog.getByLabel("描述").fill(finalDescription);
  await editDialog.getByRole("textbox", { name: "成员" }).fill("member@example.com");
  await expect(editDialog.getByText("member@example.com")).toBeVisible();
  const memberCheckbox = editDialog.getByRole("checkbox", { name: /member@example\.com/ });
  await memberCheckbox.check();
  await expect(memberCheckbox).toBeChecked();
  await editDialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("知识库已更新。")).toBeVisible();
  await expect(page.getByRole("heading", { name: finalName })).toBeVisible();
  await expect(page.getByRole("heading", { name: finalName }).locator("xpath=following-sibling::p[1]")).toHaveText(
    finalDescription,
  );
  await expect(page.getByText("member@example.com")).toBeVisible();

  await page.getByRole("button", { name: "新建知识库" }).click();
  const duplicateDialog = page.getByRole("dialog");
  await duplicateDialog.getByLabel("知识库名称").fill(finalName);
  await duplicateDialog.getByRole("button", { name: "保存" }).click();
  await expect(duplicateDialog.getByText("当前租户下已存在同名知识库。")).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "关闭" }).click();

  await page.getByLabel("搜索知识库").fill(finalName);
  await expect(page).toHaveURL(/search=/);
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(page).not.toHaveURL(/[?&]pageSize=/);
  await expect(page).not.toHaveURL(/[?&]sort=/);
  await expect(page.getByRole("button", { name: new RegExp(finalName) }).first()).toBeVisible();
  await expect(page.getByLabel("排序")).toHaveCount(0);
  await expect(page.getByLabel("每页条数")).toHaveCount(0);
  await expect(page.getByText("最近更新")).toHaveCount(0);

  await page.getByRole("button", { name: "退出" }).click();
  await page.getByLabel("邮箱").fill("member@example.com");
  await page.getByLabel("密码", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "知识库工作台" })).toBeVisible();

  await expect(page.getByRole("button", { name: "新建知识库" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑知识库" })).toHaveCount(0);

  await page.getByLabel("搜索知识库").fill(finalName);
  await expect(page.getByRole("button", { name: new RegExp(finalName) }).first()).toBeVisible();

  await page.getByLabel("搜索知识库").fill(adminOnlyName);
  await expect(page.getByText("当前搜索条件下没有匹配的知识库。")).toBeVisible();
  await expect(page.getByText(adminOnlyName)).toHaveCount(0);
});
