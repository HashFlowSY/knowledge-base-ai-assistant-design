# Frontend State Management

## State Categories

| Category | Tool | Examples |
| --- | --- | --- |
| Server state | TanStack Query | API data, cached responses, mutations |
| URL state | Query parameters | list page, filters, search, sort, selected tab |
| Local UI state | `useState` | modal open state, dropdown state |
| Shared UI state | React Context | theme, shell layout state, feature flags |

Do not put server data in React Context. Use TanStack Query.

## List State

List pages must keep shareable state in the URL:

- `page`
- `pageSize`
- `search`
- `sort`
- filters such as `status`, `role`, or `knowledgeBaseId`

The API owns pagination, sorting, filtering, and search semantics. The frontend owns controls, URL synchronization, loading state, empty state, and error state.

For user management, task queues, document logs, and audit-like lists:

- Use shadcn/ui Table for markup.
- Use a project-level lightweight list component for repeated layout patterns.
- Do not add an extra table state library by default.

## TanStack Query

Use query keys that include all inputs affecting the response.

```typescript
useQuery({
  queryKey: ["documents", { knowledgeBaseId, page, pageSize, search }],
  queryFn: () => api.documents.list({ knowledgeBaseId, page, pageSize, search }),
  placeholderData: (previousData) => previousData,
});
```

Disable queries until required parameters exist.

```typescript
useQuery({
  queryKey: ["knowledge-base", knowledgeBaseId],
  queryFn: () => api.knowledgeBases.get({ id: knowledgeBaseId }),
  enabled: typeof knowledgeBaseId === "string" && knowledgeBaseId.length > 0,
});
```

## Mutations

After a mutation:

- Invalidate or update every affected query.
- Use optimistic updates only when rollback is straightforward.
- Snapshot previous cache state before optimistic updates.
- Roll back on error.

## Context

Use Context sparingly for UI-level cross-cutting state.

Good uses:

- App shell collapsed state.
- Current command palette state.
- Feature flags loaded at shell level.

Bad uses:

- API results.
- Form state.
- Per-list pagination and filters.
- State used by a single component.

