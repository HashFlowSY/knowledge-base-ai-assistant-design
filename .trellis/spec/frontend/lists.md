# Frontend List Page Guidelines

These rules define list/table pages without adding a table state library.

## Scope

Applies to:

- knowledge base lists.
- user management.
- task queue status.
- document processing logs.
- audit logs.
- provider config lists.

## Stack

- shadcn/ui Table for table markup.
- TanStack Query for server state.
- URL query parameters for list state.
- Project-level lightweight list components for repeated patterns.

Do not add an extra table state library by default.

## Responsibilities

Frontend owns:

- filter controls.
- search input.
- sort controls.
- pagination controls.
- URL state synchronization.
- loading state.
- empty state.
- error state.
- row actions and confirmation dialogs.

API owns:

- pagination semantics.
- sorting semantics.
- filtering semantics.
- search semantics.
- authorization filtering.

## URL State

Common query parameters:

- `page`
- `pageSize`
- `search`
- `sort`
- domain filters such as `status`, `role`, `knowledgeBaseId`, `actorId`, `action`

Changing search, filters, or sort resets `page` to `1`.

## Query Keys

List query keys must include every parameter that changes the response:

```typescript
["ingestion-jobs", { page, pageSize, status, knowledgeBaseId, sort }]
```

Use `placeholderData` to keep previous page data while loading the next page when that improves ergonomics.

## Table UI

Every list page must handle:

- loading state.
- empty state with domain-specific text.
- error state with retry.
- disabled row actions during pending mutations.
- pagination summary.

Column headers with sorting must expose the active sort state.

## Row Actions

Destructive row actions must use confirmation dialogs.

Admin-only row actions must be hidden or disabled in the UI and still rejected by the API.

## Audit and Logs Lists

High-volume append-only lists may use cursor pagination.

Audit/log rows should avoid rendering huge metadata inline. Use compact summaries and a detail drawer/dialog when needed.

