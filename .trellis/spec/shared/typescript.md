# TypeScript Guidelines

## Zod-First Boundaries

Use Zod schemas for API inputs, API outputs, environment config, webhook payloads, ingestion metadata, provider responses, and any external input.

Define schemas first, then infer TypeScript types:

```typescript
import { z } from "zod";

export const listDocumentsInputSchema = z.object({
  knowledgeBaseId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;
```

Do not manually duplicate a type that already has a schema.

## Cross-Layer Types

Types that cross app/package boundaries must be owned by the package that owns the contract.

Examples:

- API request/response types live with the API module or shared API contract.
- Database row and insert types live with the database package.
- Provider normalized response types live with `src/packages/ai-providers`.
- Ingestion job types live with `src/packages/ingestion` or `src/packages/queue`, depending on ownership.

Frontend code imports or infers these types. It does not redefine backend shapes locally.

## Narrow Unknown Values

Use `unknown` for untrusted values and narrow explicitly.

```typescript
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
```

## Exported Function Return Types

Exported functions in shared packages, backend packages, and reusable frontend modules should declare return types when inference would hide an important contract.

Required for:

- Package public APIs.
- Provider adapters.
- Ingestion pipeline steps.
- RAG retrieval functions.
- Security helpers.
- API mappers.

```typescript
export async function getKnowledgeBase(
  id: string,
): Promise<KnowledgeBase | null> {
  return knowledgeRepository.findById(id);
}
```

Local callbacks and small component-private helpers may rely on inference when the type is obvious.

## Discriminated Unions

Use discriminated unions for state machines and multi-shape results.

```typescript
type IngestionStepResult =
  | { status: "success"; documentId: string }
  | { status: "retryable_error"; reason: string; retryAfterMs: number }
  | { status: "fatal_error"; reason: string };
```

Use strict equality for narrowing:

```typescript
if (result.status === "retryable_error") {
  scheduleRetry(result.retryAfterMs);
}
```

## Paginated Responses

List endpoints should return explicit pagination metadata.

```typescript
type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
```

Cursor pagination is acceptable for append-heavy or high-volume logs, but the endpoint contract must clearly identify the cursor shape.
