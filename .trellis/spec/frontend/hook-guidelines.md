# Hook Guidelines

## Naming

Use the `use{Feature}{Action}` pattern.

Examples:

- `useKnowledgeBases`
- `useKnowledgeBase`
- `useCreateKnowledgeBase`
- `useUpdateKnowledgeBase`
- `useDeleteKnowledgeBase`
- `useDocumentUpload`
- `useProviderConfig`

Query hooks that read lists or details may omit the action. Mutation hooks should include the action.

## Query Hooks

Create feature-scoped hooks for repeated query patterns.

```typescript
export function useDocuments(input: ListDocumentsInput) {
  return useQuery({
    queryKey: ["documents", input],
    queryFn: () => api.documents.list(input),
    placeholderData: (previousData) => previousData,
  });
}
```

Rules:

- Include all query inputs in the query key.
- Use `enabled` when required IDs may be absent.
- Keep `staleTime` and `gcTime` intentional; do not copy defaults blindly.
- Return domain-friendly names when wrapping raw query results.
- Keep query key objects serializable and stable.

Suggested `staleTime` starting points:

| Data type | Suggested `staleTime` | Notes |
| --- | --- | --- |
| Auth/session | Managed by auth layer | Avoid duplicating auth cache semantics |
| Task queue / ingestion status | 5-30 seconds | Often changes while jobs run |
| List pages | 1-5 minutes | Tune by domain freshness needs |
| Detail pages | 1-5 minutes | Invalidate after mutations |
| Static config/options | 30-60 minutes | Use shorter values for provider status |

## Mutation Hooks

Keep mutations close to their feature module.

```typescript
export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateKnowledgeBaseInput) =>
      api.knowledgeBases.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}
```

Rules:

- Invalidate every affected list/detail query.
- Avoid nested mutation hooks that only wrap other mutation hooks.
- Export helper types when callback override typing would otherwise be unclear.
- Keep optimistic updates focused and reversible.
- Cancel affected in-flight queries before optimistic updates.
- Snapshot previous cache data before optimistic updates.
- Roll back snapshots on error.

## Compound Hooks

Compound hooks are acceptable when they represent one clear user workflow.

Examples:

- `useProviderConfigForm`
- `useDocumentUpload`
- `useKnowledgeBaseMembers`

Avoid compound hooks that become catch-all feature controllers.

## Internal API Calls

Hooks should call the project API client or RPC contract. Avoid raw `fetch` for internal APIs unless the API client cannot represent the endpoint yet and the reason is documented.

