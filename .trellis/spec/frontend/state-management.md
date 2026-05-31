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

- Use shadcn/ui Table from `@/components/ui/table` for markup.
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

## Frontend-Only Mock Store Exception

Use this pattern only for frontend MVP review tasks that explicitly exclude real
backend/auth/API integration.

When a task needs cross-page mock workflow state:

- Keep the mock business state behind one feature-owned boundary, such as
  `src/apps/web/src/features/mock/store.tsx`.
- Persist only to a clearly named frontend-only `localStorage` key.
- Include a `schemaVersion` field in the persisted shape.
- Initialize from deterministic seed data when storage is absent.
- Discard and recover to seed data when JSON parsing fails, `schemaVersion` is
  unsupported, or required top-level collections are missing.
- Validate required fields inside persisted entity collections after mock state
  shape changes. If an existing persisted state is missing a newly required
  field, either migrate it explicitly or discard and recover to seed data with
  the standard recovery notice.
- Show a non-raw user-facing recovery notice after discarding bad persisted
  state.
- Provide a visible development/mock reset control.
- Keep feature components receiving typed data and mutation callbacks from the
  store; do not import unrelated page fixtures.
- Keep URL search params responsible for list state such as `search`, `filter`,
  `sort`, and `page`.

This exception is not a production persistence contract. When real APIs exist,
server state must move to TanStack Query hooks and typed API contracts rather
than remaining in React Context.

## Backend API Integration Verification

### 1. Scope / Trigger

This section applies when a frontend page is connected to real backend/auth/API
data, or when frontend-only MVP mock data is removed.

Any page migrated from `src/apps/web/src/features/mock/*` must prove that mock
business state has been replaced by typed API hooks and TanStack Query, not by a
new app-wide React Context store.

### 2. Production State Contract

When real APIs exist for a page:

- Production page, layout, shell, and feature modules must not import from
  `src/apps/web/src/features/mock/*`.
- `MockStoreProvider` must not be mounted by the production root layout.
- `useMockStore`, `MockState`, `MockAction`, and `Mock*` business entity types
  must not appear in production page or feature code.
- Server state must be read through feature-scoped TanStack Query hooks.
- Server mutations must be implemented with TanStack Query mutation hooks.
- API response types must be imported or inferred from the typed API/RPC
  contract, not redefined in frontend modules.
- React Context may only hold shared UI state such as shell layout or feature
  flags. It must not hold API results, list data, auth-owned session data, or
  mutation results.
- `localStorage` must not persist server-owned business data such as knowledge
  bases, documents, ingestion jobs, logs, chat sessions, citations, provider
  configs, users, audit events, or auth sessions.

### 3. List And URL Contract

For migrated list pages:

- URL search params own shareable UI state: `page`, `pageSize`, `search`,
  `sort`, and filters.
- TanStack Query keys must include every URL/input value that affects the API
  response.
- The API owns pagination, sorting, filtering, and search semantics.
- The frontend may derive display-only view models from API responses, but must
  not re-filter or re-sort full server collections as a substitute for API list
  parameters.

### 4. Auth And Permission Contract

After backend/auth integration:

- Session and actor identity come from the auth layer or an authenticated API
  endpoint.
- Page access checks must match backend authorization behavior.
- Admin-only UI actions may be hidden or disabled in the frontend, but the API
  must still reject unauthorized mutations.
- Session expiration and forbidden states must use API/auth responses rather
  than mock session flags.

### 5. Mutation Contract

After a successful mutation:

- Invalidate or update every affected query.
- Keep optimistic updates narrow and reversible.
- Roll back optimistic cache changes on error.
- Do not update detached local copies of server entities after a mutation.

### 6. Tests Required

For each page migrated from mock data to backend APIs, include tests or static
checks that assert:

- No production source file for the migrated page imports
  `src/apps/web/src/features/mock/*`.
- The page uses feature-scoped query/mutation hooks for API data.
- Loading, empty, error, unauthorized, and forbidden states are represented.
- List URL params are passed into the query key and API request.
- Mutations invalidate or update affected queries.
- `pnpm --filter @kb/web lint` and `pnpm --filter @kb/web typecheck` pass.

For broad mock-store removal work, run a repository check equivalent to:

```bash
rg -n "features/mock|useMockStore|MockStoreProvider|MockState|MockAction" src/apps/web/src
```

Any remaining match must be either deleted, moved into an explicitly named demo
or test-only module, or justified in the task PRD.

### 7. Wrong vs Correct

#### Wrong

```typescript
const { state, dispatch } = useAppStore();
const documents = state.documents.filter((item) => item.status === status);
```

#### Correct

```typescript
const documentsQuery = useDocuments({
  page,
  pageSize,
  search,
  sort,
  status,
});
```
