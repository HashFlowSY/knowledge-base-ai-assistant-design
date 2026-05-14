# Frontend Copywriting Guidelines

These rules define Chinese UI copy organization for Production v1.

## Language

Production v1 UI is Chinese.

Do not add an i18n framework for v1 unless the product scope changes.

## Copy Ownership

UI copy should be centralized by feature or shared module instead of scattered across components.

Recommended shape:

```text
src/apps/web/src/copy/
├── common.ts
├── auth.ts
├── knowledge.ts
├── ingestion.ts
├── chat.ts
├── users.ts
├── provider.ts
└── audit.ts
```

Exact paths may adapt to the final web app structure, but copy should remain easy to find and review.

## Required Copy Categories

Centralize:

- navigation labels.
- page titles.
- button labels.
- form labels.
- field help text.
- validation messages.
- empty states.
- error states.
- confirmation dialog text.
- toast messages.
- system notices.

## Tone

Use concise enterprise-product Chinese.

Rules:

- Prefer direct action labels: `上传文件`、`导入网页`、`保存配置`.
- Avoid cute, playful, or marketing-style wording in operational UI.
- Error messages should explain what happened and what the user can do next.
- Admin/security copy should be precise and restrained.

## Error Copy

Error copy should map from API error codes where possible.

Example mapping:

```typescript
const apiErrorCopy = {
  FORBIDDEN: "你没有权限执行此操作。",
  VALIDATION_ERROR: "请检查输入内容后重试。",
  PROVIDER_UNAVAILABLE: "模型服务暂时不可用，请稍后重试。",
};
```

Do not expose raw provider errors, stack traces, SQL errors, or secret-bearing messages.

## Formatting

Use consistent terms:

- `知识库`
- `文档`
- `任务`
- `处理日志`
- `引用`
- `反馈`
- `模型服务`
- `密钥`
- `审计日志`

Avoid mixing synonyms for the same concept across pages.

