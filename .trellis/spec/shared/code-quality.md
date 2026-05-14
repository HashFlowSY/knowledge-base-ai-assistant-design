# Code Quality Guidelines

## Type Safety

Never bypass TypeScript checks.

Forbidden:

```typescript
const name = user!.name;
function process(input: any) {}
// @ts-ignore
doSomething(invalidValue);
```

Required:

```typescript
const user = getUser();
if (!user) {
  throw new Error("User not found");
}

function process(input: unknown) {
  if (!isProcessInput(input)) {
    throw new Error("Invalid input");
  }
}
```

Use optional chaining and explicit defaults when absence is valid:

```typescript
const firstChunk = document.chunks?.[0] ?? null;
```

## Logging

Use structured logging for backend, worker, ingestion, provider, queue, and audit-related code.

Required context fields when available:

- `requestId`
- `jobId`
- `tenantId`
- `actorId`
- `knowledgeBaseId`
- `documentId`
- `action`

Never log:

- Provider keys
- Object storage credentials
- Database connection strings
- Raw prompt content by default
- Full chunk content by default
- Full model responses by default

## Error Handling

Do not swallow errors silently.

```typescript
try {
  await runIngestionStep(jobId);
} catch (error) {
  logger.error("ingestion_step_failed", {
    jobId,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
```

API errors should use the project error contract:

```typescript
{
  code: "FORBIDDEN",
  message: "Insufficient permissions",
  requestId,
  validationErrors: undefined,
}
```

## Imports

Order imports consistently:

1. Node built-ins
2. External packages
3. Internal workspace packages
4. Local relative imports

Use `import type` for type-only imports.

```typescript
import path from "node:path";

import { z } from "zod";

import type { KnowledgeBase } from "@kb/shared";

import { normalizeTitle } from "./normalize-title";
```

## Naming

| Kind | Convention | Example |
| --- | --- | --- |
| React component | PascalCase | `KnowledgeBaseList.tsx` |
| Hook | camelCase with `use` prefix | `useKnowledgeBases.ts` |
| Utility file | kebab-case | `date-format.ts` |
| Type file | `types.ts` or kebab-case | `types.ts` |
| Directory | kebab-case | `knowledge-base/` |
| Type/interface | PascalCase | `CreateDocumentInput` |
| Boolean variable | `is`, `has`, `should`, `can` prefix | `hasPermission` |

## Dead Code

Remove:

- Unused imports
- Unused variables, functions, and types
- Commented-out implementation blocks
- Unreachable code

