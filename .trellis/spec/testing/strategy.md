# Testing Strategy Guidelines

These rules define the test strategy for Production v1.

## Test Tools

Use:

- Vitest for unit tests.
- Testcontainers for integration tests.
- Playwright for E2E tests.

## Unit Tests

Unit tests should cover pure logic and package-level behavior without real infrastructure.

Required unit areas:

- chunking.
- permission checks.
- provider adapter mapping.
- provider error normalization.
- hybrid retrieval fusion.
- API error mapping.
- configuration validation.
- SSRF URL validation helpers.
- object key generation.
- timestamp serialization helpers.

Mock external dependencies at package boundaries, not deep inside implementation details.

## Integration Tests

Integration tests use Testcontainers for:

- PostgreSQL with pgvector.
- Redis.
- Meilisearch.
- MinIO.

Required integration flows:

- database migrations apply cleanly.
- ingestion job creates document, chunks, embeddings, and search index entries.
- ingestion failure records failed status and job logs.
- retryable ingestion failure can be retried safely.
- API list endpoints enforce tenant and knowledge-base filters.
- RAG retrieval filters by authorized knowledge bases.
- provider config secrets are encrypted at rest and not returned in API responses.
- object upload metadata matches object storage state.

Provider calls must use deterministic mocks or local fake providers in integration tests.

## E2E Tests

Playwright covers user-visible workflows:

- login.
- create knowledge base.
- upload supported file.
- import URL.
- view task status.
- view document processing logs.
- chat with selected knowledge base.
- verify answer citations render.
- submit answer feedback.
- admin configures provider.
- admin views audit logs.

E2E tests should assert permissions:

- member cannot access admin provider page.
- member cannot access unassigned knowledge base.
- admin-only actions are unavailable or rejected for member.

## Provider Mocks

Provider mocks must be deterministic.

Mock behavior:

- Embedding returns stable vectors for stable input.
- Rerank returns predictable order and scores.
- Chat returns answer text referencing provided citation ids.
- Failure modes can simulate timeout, rate limit, invalid key, and unavailable provider.

Do not call real external providers in automated tests by default.

## Test Data

Use small fixtures:

- short PDF fixture.
- Markdown fixture.
- TXT fixture.
- HTML fixture for URL ingestion.

Fixtures must avoid sensitive or copyrighted production data.

## Test Naming

Name tests after behavior:

```typescript
it("filters retrieval results by authorized knowledge base", async () => {
  // test body
});
```

Avoid tests that only verify implementation details such as private helper call order.

## CI Commands

Expected commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm build`

Integration and E2E tests may require Docker.

These commands are required project contracts after application scaffolding exists.
During bootstrap, a missing `package.json` script must be made explicit in the task
or pull request notes. Do not silently skip a missing script and report the quality
gate as passed.

## Regression Tests

Add regression tests for:

- bugs in permission filtering.
- ingestion retry duplication.
- provider error handling.
- SSRF bypasses.
- migration issues.
- citation mismatch.
- secret leakage in responses or logs.
