# brainstorm: 迁移 Web 前端组件至 shadcn ui

## Goal

将 `src/apps/web` 当前前端组件体系完整迁移到 shadcn/ui，使 shadcn 成为视觉源头，并在任务完成时清除旧 UI 入口、旧样式文件和业务层旧视觉类。

## What I already know

* 目标范围首先聚焦 `/knowledge-base-ai-assistant/src/apps/web` 下的前端项目文件。
* 开始定计划前必须详细扫描前端项目，充分理解现有组件、样式、入口和导入关系。
* 可以简单替换的组件，例如 `button`，应直接替换为 shadcn/ui。
* 不能简单替换的组件，应使用 wrapper。
* 所有组件需要共享同一套 token、variant、间距、圆角、状态样式。
* shadcn 是视觉源头。
* 迁移期只允许一个旧入口：当前 `features/ui/*` 可以暂时作为兼容层。
* 新代码不得再 import `../ui/button`、`../ui/dialog`、`../ui/select-field`。
* 旧 wrapper 内部迁移必须拆成可执行、可验收的步骤，不能用笼统表述替代计划。
* 迁移完成后删除 `features/ui/button-styles.ts`、`select-field-styles.ts`、`drawer-styles.ts` 这类旧样式文件。
* `src/apps/web` 已有 shadcn/ui 配置：`components.json` 使用 `radix-luma`、Tailwind v4、`baseColor: mist`，并将 `ui` alias 指向 `@/components/ui`。
* `src/apps/web/src/components/ui` 已存在 shadcn 组件：button、dialog、sheet、select、input、textarea、label、checkbox、table、card、badge、alert、alert-dialog、scroll-area、skeleton。
* 业务层目前几乎没有直接 import `@/components/ui/*`，主要仍通过 `src/features/ui/*` 旧入口使用 UI。
* 旧入口不止 `button/dialog/select-field`，还包括 `panel/notice/status/drawer/skeleton/scroll-area/list-item-styles`。
* 页面和 feature 文件里仍有大量 `slate-*`、`teal-*`、`rounded-md`、`border-slate-*`、`focus:ring-teal-*` 等硬编码旧视觉类。
* 视觉统一以当前 shadcn 生成组件的视觉为准，包括现有 `radix-luma` 风格中的圆角、间距、状态和表面层级。
* Drawer 不保留当前静态详情栏交互契约；迁移后以 shadcn `Sheet` 的 overlay 交互为准。
* `features/ui/form-types.ts` 需要迁移到 `src/apps/web/src/lib/form-types.ts`，不继续留在 `features/ui`。
* 本任务范围是完成全部迁移；下面的迁移步骤只是同一个任务内的执行顺序和验收节点，不代表拆成多个任务或缩小最终交付范围。

## Assumptions (temporary)

* 这是一个分阶段迁移任务，第一阶段需要先建立清晰边界、兼容层规则和组件映射，而不是一次性盲改所有 UI。
* 现有仓库已包含 shadcn/ui 相关依赖或基础配置，但仍需通过扫描确认。

## Open Questions

* None.

## Requirements (evolving)

* 扫描 `src/apps/web` 的组件、样式、设计 token、导入关系、构建配置和现有 shadcn 配置。
* 给出可执行的迁移计划，区分直接替换、wrapper 迁移、兼容层保留、旧样式清理。
* 明确迁移期导入规则，防止新代码继续依赖旧 UI 入口。
* 在用户确认计划前不进入实现。
* 本任务必须完成全部迁移，不允许只完成兼容层迁移后结束。
* 迁移计划必须覆盖 `features/ui/*` 的全部旧 UI surface，而不仅是 `button/dialog/select-field`。
* 迁移计划必须处理页面和 feature 层硬编码视觉类，否则无法达成统一 token/variant/spacing/radius/state。
* 迁移后的视觉策略：
  * 当前 shadcn `radix-luma` 组件是视觉基准。
  * 旧业务 UI 的 `rounded-md`、`slate/teal` 配色和旧 focus ring 不作为目标风格保留。
  * wrapper、页面和 feature helper 中的样式需要向 shadcn 当前的圆角、间距、token、状态样式靠齐。
* Drawer 迁移后的交互策略：
  * 用户详情类侧边内容改用 shadcn `Sheet` overlay 交互。
  * 不保留当前大屏页面内静态侧栏契约。
  * 移除 `drawer-rules.ts` 中隐藏关闭按钮的旧规则。
* 表单提交类型迁移：
  * `features/ui/form-types.ts` 迁移到 `src/apps/web/src/lib/form-types.ts`。
  * 所有当前 import `../ui/form-types` 的业务代码改为从 `@/lib/form-types` 或相对 `src/lib/form-types` 引入。
  * 更新 `.trellis/spec/frontend/component-guidelines.md` 中的示例路径，避免未来继续引用 `../ui/form-types`。
* 迁移期导入边界：
  * 新代码需要通用 UI primitive 时，直接 import `@/components/ui/*`。
  * `features/ui/*` 只作为旧代码兼容层保留。
  * 不得在新代码中新增 `../ui/button`、`../ui/dialog`、`../ui/select-field` 这类相对旧入口导入。
  * 旧调用点按下方迁移步骤移除；当某个旧入口没有业务调用后，添加或更新防回归检查，禁止再次引入。
* 任务完成条件：
  * 业务代码不再 import `src/features/ui/button`、`dialog`、`select-field`、`drawer`、`panel`、`notice`、`status`、`skeleton`、`scroll-area`、`list-item-styles`。
  * 业务代码不再 import `src/features/ui/form-types`。
  * 通用 UI primitive 只从 `@/components/ui/*` 引入。
  * 表单提交类型只从 `src/apps/web/src/lib/form-types.ts` 引入。
  * 删除 `features/ui/button-styles.ts`、`features/ui/select-field-styles.ts`、`features/ui/drawer-styles.ts`。
  * 删除已无调用的旧兼容入口和旧 helper 测试。
  * `src/apps/web/src/features` 和 `src/apps/web/src/app` 中不再保留旧视觉硬编码类作为组件视觉来源。
  * web lint、typecheck、相关测试通过。

## Migration Steps

1. 锁定边界和基线
   * 在 PRD 中记录导入边界。
   * 统计每个 `features/ui/*` 旧入口的业务调用点，作为迁移清单基线。
   * 不改功能行为，不做视觉调整。

2. 统一 token 源头
   * 以 `src/apps/web/src/app/globals.css` 和 shadcn 生成组件为视觉源头。
   * 以 shadcn 当前 `radix-luma` 的圆角和 spacing 为目标，不把旧 `rounded-md` 体系迁入 shadcn。
   * wrapper 和业务组件新增样式时只使用 shadcn token 类，如 `bg-background`、`bg-card`、`text-foreground`、`text-muted-foreground`、`border-border`、`bg-muted`、`ring-ring`、`text-destructive`。
   * 不新增 `slate-*`、`teal-*`、`red-*`、`blue-*`、`yellow-*` 这类硬编码色值工具类。

3. 迁移 `features/ui/button.tsx` 并清除业务层旧 button 入口
   * 用 shadcn `Button` 作为内部实现。
   * 保留当前兼容 API：`primary`、`secondary`、`ghost`、`danger`、`inverse`、`disabledReason`、`ButtonLink`。
   * 将旧 variant 映射到 shadcn variant 和 token 类。
   * 保持可触达尺寸不低于 44px。
   * 把业务调用点改为 `@/components/ui/button` 或更合适的 shadcn 组合。
   * 更新测试后删除 `features/ui/button-styles.ts` 和无调用的 `features/ui/button.tsx`。

4. 迁移 `features/ui/select-field.tsx` 并清除业务层旧 select-field 入口
   * 用 shadcn `Select` primitives 作为内部实现。
   * 保留当前兼容 API：`ariaLabel`、`value`、`options`、`onChange`、`placement`、`tone`。
   * 将 `placement` 映射到 shadcn content positioning。
   * 将 `tone` 映射到 token 类，不再使用旧色值。
   * 把业务调用点改为直接组合 shadcn `Select` 或使用 feature-local wrapper。
   * 更新键盘、打开方向和选中态测试后删除 `features/ui/select-field-styles.ts` 和无调用的 `features/ui/select-field.tsx`。

5. 迁移 `features/ui/dialog.tsx` 并清除业务层旧 dialog 入口
   * 用 shadcn `Dialog` primitives 实现 `DialogFrame`。
   * 保留当前调用方式：外部条件渲染、`onClose`、可选 `onSubmit`、`title`、`description`、children。
   * 保留表单提交语义和可访问标题。
   * 将手写 overlay、surface、header 样式替换为 shadcn token 和 spacing。
   * 把业务 dialogs 改为直接组合 shadcn `Dialog` primitives 或 feature-local wrapper。
   * 业务调用点清零后删除无调用的 `features/ui/dialog.tsx`。

6. 处理 `features/ui/drawer.tsx` 并清除业务层旧 drawer 入口
   * 用 shadcn `Sheet` 作为详情内容的交互和视觉源头。
   * 业务调用点改为直接组合 shadcn `Sheet`，或使用 feature-local wrapper 组合 shadcn `Sheet`。
   * 用户详情入口需要提供明确的打开/关闭状态，关闭按钮使用 shadcn `SheetClose` 或 `SheetContent` 默认关闭能力。
   * 删除旧静态侧栏布局假设和旧隐藏关闭按钮规则。
   * 业务调用点清零后删除无调用的 `features/ui/drawer.tsx`、`drawer-rules.ts`、`drawer-styles.ts`。

7. 迁移辅助 UI wrapper 并清除业务层旧辅助入口
   * `features/ui/panel.tsx` 组合 shadcn `Card`。
   * `features/ui/notice.tsx` 组合 shadcn `Alert`。
   * `features/ui/status.tsx` 组合 shadcn `Badge`。
   * `features/ui/skeleton.tsx` 组合 shadcn `Skeleton`，保留 AppShell loading 结构。
   * `features/ui/scroll-area.ts` 根据 `onScroll` 和 flex fill 需求选择 shadcn `ScrollArea` 或保留 native scroll wrapper，但样式必须使用 token。
   * `features/ui/list-item-styles.ts` 改成 token-based helper，或替换为明确的 action row wrapper。
   * 把业务调用点改为直接组合 shadcn primitives 或 feature-local wrappers。
   * 业务调用点清零后删除无调用的旧辅助入口和旧 helper 测试。

8. 迁移业务模块硬编码样式
   * auth：登录页、未授权页、loading。
   * shell：AppShell、侧边栏、移动导航。
   * admin：列表、行、分页、用户/供应商 dialogs、详情面板。
   * workspace：列表、摘要、dialogs、member picker、表单字段。
   * chat：会话列表、消息区、引用面板、反馈表单。
   * 每个模块迁移时同步移除该模块新增或触碰区域的旧色值类和旧入口导入。

9. 迁移 `form-types`
   * 将 `features/ui/form-types.ts` 移到 `src/apps/web/src/lib/form-types.ts`。
   * 更新所有业务 import。
   * 更新 `.trellis/spec/frontend/component-guidelines.md` 中的 `FormSubmitHandler` 示例。
   * 删除旧 `features/ui/form-types.ts`。

10. 更新测试和防回归检查
   * 将旧测试中断言 `slate-*`、`teal-*`、`rounded-md` 的部分改为断言行为、可访问属性、尺寸契约或 token 类。
   * 当 `../ui/button`、`../ui/dialog`、`../ui/select-field` 某个入口在业务层清零后，添加扫描型测试或现有 contract test，禁止业务层重新导入。
   * 每个阶段至少运行 `pnpm --filter @kb/web typecheck`、`pnpm --filter @kb/web lint` 和相关 `vitest`。

11. 清理旧入口
   * 确认 `features/ui/*` 中没有业务 UI 兼容入口残留。
   * 删除 `button-styles.ts`、`select-field-styles.ts`、`drawer-styles.ts` 和已无调用的旧 helper 测试。
   * 添加或更新防回归检查，覆盖旧入口导入和旧样式文件回流。
   * 再跑完整 web 质量检查。

## Acceptance Criteria (evolving)

* [ ] 已完成 `src/apps/web` 前端扫描并记录发现。
* [ ] 已明确 shadcn/ui 当前配置、可复用 token 和现有组件覆盖情况。
* [ ] 已确认迁移后视觉以当前 shadcn `radix-luma` 组件为准。
* [ ] 已列出直接替换组件、需要 wrapper 的组件、旧入口兼容策略。
* [ ] 业务层已清除 `features/ui/*` 旧 UI 入口导入。
* [ ] `features/ui/form-types.ts` 已迁移到 `src/apps/web/src/lib/form-types.ts`，并同步更新业务 import 和前端规范示例。
* [ ] `button-styles.ts`、`select-field-styles.ts`、`drawer-styles.ts` 已删除。
* [ ] 业务层旧视觉硬编码类已迁到 shadcn token 或 shadcn primitives。
* [ ] 已确认没有剩余开放决策。
* [ ] 用户确认完整迁移计划后再进入实现阶段。

## Definition of Done (team quality bar)

* Tests added/updated when behavior or shared UI contracts change.
* Lint / typecheck pass.
* Docs/notes updated if migration rules or component contracts change.
* Rollout/rollback considered if migration touches broad UI surface.

## Out of Scope (explicit)

* 未经用户确认，不开始实际组件迁移实现。
* 不做无关页面重设计。
* 不引入全局安装或静默执行外部安装步骤。

## Technical Notes

* Created task: `.trellis/tasks/05-31-shadcn-ui-migration`.
* Frontend scan artifact: `.trellis/tasks/05-31-shadcn-ui-migration/research/web-ui-scan.md`.
* Relevant guidelines loaded: `.trellis/spec/frontend/index.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/quality-guidelines.md`, `.trellis/spec/shared/typescript.md`.
