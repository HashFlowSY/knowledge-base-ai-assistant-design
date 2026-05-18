# 新增用户页面增加密码框

## Goal

管理员在用户管理页面新增和编辑用户时，需要直接设置或重置该用户的登录密码，避免只能创建账号但无法维护密码的问题。

## What I Already Know

- 用户管理入口是 `src/apps/web/src/app/users/page.tsx`，实际页面由 `AdminListPage` 和 `UserDialog` 组成。
- 新增用户弹窗在 `src/apps/web/src/features/admin/user-dialog.tsx`。
- 当前创建用户 action 只有姓名、邮箱、角色、状态，没有密码字段。
- 当前编辑用户弹窗用于维护姓名、邮箱、角色、访问状态，但没有重置密码能力。
- 当前 mock 登录在登录页和 store reducer 中都使用固定密码 `password123`。
- 项目是 Next.js 16、React 19、TypeScript strict、Tailwind CSS、shadcn/ui 风格控件，前端文案集中在 `src/apps/web/src/copy/`。

## Assumptions

- 这是本地 mock 前端状态，密码会作为演示凭据保存在 mock state 中；不做真实后端哈希、重置密码邮件或 Better Auth 接入。
- 现有种子用户继续使用 `password123`，保持演示登录说明不变。

## Requirements

- 新增用户弹窗在邮箱后增加“密码”输入框，使用 `type="password"`。
- 编辑用户弹窗也显示“密码”输入框；留空表示不修改密码，填写则重置该用户密码。
- 新增用户提交时必须校验密码非空；空密码展示中文错误提示。
- 密码框右侧显示“显示密码”图标按钮。
- 鼠标按住显示密码图标时，密码框临时切换为明文；鼠标松开、移出、取消或失焦后恢复隐藏。
- 密码框的选中复制功能不能复制密码内容。
- 创建用户 action、mock user 数据结构、mock reducer 需要接收并保存密码。
- 更新用户 action、mock reducer 需要支持可选 password；未填写时保留原密码。
- mock 登录逻辑需要按用户自身密码校验，让新增用户可以用管理员设置的密码登录。
- 现有管理员和成员种子账号仍可用 `password123` 登录。
- 更新相关单元测试和 E2E 流程，覆盖新增用户密码字段。

## Acceptance Criteria

- [ ] 管理员点击“新增用户”后可以看到“密码”输入框。
- [ ] 新增用户时不填写密码会阻止提交并提示“请输入用户密码。”。
- [ ] 填写密码后新增用户成功，用户列表展示新用户。
- [ ] 新增用户可以使用创建时填写的密码登录。
- [ ] 编辑用户弹窗显示“密码”输入框，留空保存不会修改原密码。
- [ ] 编辑用户时填写新密码后，该用户只能使用新密码登录。
- [ ] 鼠标按住显示密码图标时显示明文，松开后恢复隐藏。
- [ ] 选中密码框内容并复制时，剪贴板不能得到密码文本。
- [ ] `pnpm --filter @kb/web typecheck` 通过。
- [ ] 相关测试通过。

## Out Of Scope

- 密码强度规则、二次确认密码、点击后常驻显示的密码切换按钮。
- 后端 API、数据库 schema、真实认证系统接入。

## Technical Notes

- 相关规范：`.trellis/spec/frontend/index.md`。
- 相关代码：
  - `src/apps/web/src/features/admin/user-dialog.tsx`
  - `src/apps/web/src/features/mock/types.ts`
  - `src/apps/web/src/features/mock/store.tsx`
  - `src/apps/web/src/features/mock/seed.ts`
  - `src/apps/web/src/features/auth/login-page.tsx`
  - `src/apps/web/src/copy/admin.ts`
  - `src/apps/web/src/features/mock/store.test.ts`
  - `e2e/bootstrap.spec.ts`

## Definition Of Done

- Tests added or updated for changed behavior.
- Typecheck passes.
- Frontend implementation follows existing UI and copy patterns.
