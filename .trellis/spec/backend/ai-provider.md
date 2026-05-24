# AI Provider Guidelines

These rules define provider integration for chat, embedding, and rerank.

## Ownership

`src/packages/ai-providers` owns:

- Provider interfaces.
- Provider config validation.
- Secret lookup/decryption boundary.
- Provider clients.
- Error normalization.
- Timeout, retry, and rate-limit policy.
- Usage metadata normalization.

RAG and ingestion packages call provider interfaces; they do not call vendor SDKs directly.

## Default Providers

Production v1 defaults:

- DeepSeek for chat LLM.
- Tongyi/Bailian for embedding.
- Tongyi/Bailian for rerank.

Provider abstraction must allow future OpenAI, Azure OpenAI, Anthropic, local model, domestic model, and OpenAI-compatible providers.

## Interfaces

Chat:

```typescript
type ChatRequest = {
  tenantId: string;
  providerConfigId: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  requestId: string;
};

type ChatResponse = {
  text: string;
  finishReason?: string;
  usage?: ProviderUsage;
  providerRequestId?: string;
};
```

Embedding:

```typescript
type EmbeddingRequest = {
  tenantId: string;
  providerConfigId: string;
  model: string;
  inputs: string[];
  requestId: string;
};

type EmbeddingResponse = {
  vectors: number[][];
  usage?: ProviderUsage;
  providerRequestId?: string;
};
```

Rerank:

```typescript
type RerankRequest = {
  tenantId: string;
  providerConfigId: string;
  model: string;
  query: string;
  documents: Array<{ id: string; text: string }>;
  requestId: string;
};

type RerankResponse = {
  results: Array<{ id: string; score: number; index: number }>;
  usage?: ProviderUsage;
  providerRequestId?: string;
};
```

## Secrets

Provider keys:

- Are stored encrypted at rest.
- Are encrypted with deployment-level `APP_ENCRYPTION_KEY` for v1.
- Are decrypted only inside the provider package boundary.
- Are never returned from APIs.
- Are never logged.
- Are displayed in UI only as masked metadata.

Provider key create, update, disable, and status check operations must write audit logs.

## Scenario: Fixed Provider Config API And Secret Handling

### 1. Scope / Trigger

- Trigger: implementing or changing model service configuration APIs, frontend provider settings, provider secret storage, or provider config consumption by RAG/ingestion.
- Scope: Production v1 has exactly three model service slots per tenant: `chat`, `embedding`, and `rerank`.

### 2. Signatures

- List route: `GET /api/providers` -> `ApiSuccessResponse<{ providers: ProviderSummary[] }>`
- Transport key route: `GET /api/providers/public-key` -> `ApiSuccessResponse<ProviderPublicKey>`
- Save route: `PUT /api/providers/:kind` where `kind` is `chat | embedding | rerank`
- Save body:
  ```typescript
  type SaveProviderConfigInput = {
    displayName: string;
    provider: string;
    modelId: string;
    baseUrl: string;
    status: "enabled" | "disabled";
    apiKey:
      | { mode: "keep" }
      | { mode: "encrypted"; keyId: string; ciphertext: string };
  };
  ```
- Database constraints:
  - `provider_configs.base_url` is structured, not only `settings` JSON.
  - `provider_configs` has a unique index on `(tenant_id, kind)`.

### 3. Contracts

- Frontend must submit new API keys through short-lived RSA-OAEP public-key transport encryption.
- API handlers decrypt transport ciphertext only long enough to call the provider config service.
- Provider config service stores API keys with AES-256-GCM using `APP_ENCRYPTION_KEY`.
- AES-GCM envelope fields are `alg`, `keyVersion`, `iv`, `tag`, and `ciphertext`.
- AES-GCM AAD must bind at least `tenantId`, `secretRecordId`, `purpose`, and `keyVersion`.
- API responses, logs, audit metadata, and frontend state must not contain plaintext API keys or encrypted payloads.
- Connection tests must validate the configured provider through a real provider endpoint, never by bare `GET baseUrl`.
- Production v1 provider checks:
  - DeepSeek chat: `GET <baseUrl>/models` with `Authorization: Bearer <apiKey>`.
  - Alibaba Bailian/DashScope chat: `POST <baseUrl>/chat/completions` with a minimal one-token probe.
  - Alibaba Bailian/DashScope OpenAI-compatible embedding: `POST <baseUrl>/embeddings` with a minimal input and explicit dimension for `text-embedding-v3/v4`.
  - Alibaba Bailian/DashScope native embedding: `POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding` with `input.texts` and `parameters.dimension`.
  - Alibaba Bailian/DashScope `qwen3-rerank`: `POST https://dashscope.aliyuncs.com/compatible-api/v1/reranks` with a minimal query/documents payload.
  - Alibaba Bailian/DashScope `gte-rerank-v2`: `POST https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank` with the native `input`/`parameters` payload.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Non-admin calls provider routes | `UNAUTHORIZED` or `FORBIDDEN` envelope |
| `kind` not in `chat | embedding | rerank` | `VALIDATION_ERROR` |
| First save uses `apiKey.mode = "keep"` | `VALIDATION_ERROR` |
| Transport key is expired or unknown | `VALIDATION_ERROR` |
| Connection test returns auth failure | `FORBIDDEN` with safe Chinese message |
| Connection test returns rate limit | `RATE_LIMITED` |
| Connection test unavailable/timeout | `PROVIDER_UNAVAILABLE` |
| Connection test fails | Do not write config or secret changes |
| Connection test receives provider raw error body | Normalize to safe code/message; do not expose raw body |

### 5. Good/Base/Bad Cases

- Good: save decrypts transport ciphertext, runs a deterministic connection tester in tests, then transactionally upserts one `(tenantId, kind)` config and a secret record.
- Base: updating an existing provider with `apiKey.mode = "keep"` decrypts the existing secret inside `@kb/ai-providers/service` for the connection test and keeps the same secret metadata.
- Bad: frontend sends plaintext API keys in JSON, API returns `encryptedPayload`, or RAG/ingestion reads and decrypts `secret_records` directly.

### 6. Tests Required

- `@kb/security`: AES-GCM envelope, fresh IV, AAD mismatch failure, RSA-OAEP transport encryption round trip.
- `@kb/ai-providers`: fixed three slots, first key required, failed connection test writes nothing, idempotent same-key save, key rotation metadata.
- `@kb/ai-providers`: DeepSeek/DashScope connection tester routes to provider-specific capability endpoints and maps upstream status codes without leaking raw response bodies.
- `@kb/db`: `base_url` column and `(tenant_id, kind)` unique index migration.
- `@kb/api`: admin-only routes, redacted list response, public key route, encrypted save request decryption, safe provider error mapping.
- `@kb/web`: Hono RPC provider route exposure and frontend API-key encryption helper.

### 7. Wrong vs Correct

#### Wrong

```typescript
await apiClient.api.providers[":kind"].$put({
  json: {
    apiKey: "sk-live-key",
    baseUrl,
    displayName,
    modelId,
    provider,
    status,
  },
  param: { kind: "chat" },
});
```

#### Correct

```typescript
const publicKey = await getProviderPublicKey();
const encryptedApiKey = await encryptRsaOaep({
  plaintext: rawApiKey,
  publicKey: publicKey.publicKey,
});

await apiClient.api.providers[":kind"].$put({
  json: {
    apiKey: {
      mode: "encrypted",
      keyId: publicKey.keyId,
      ciphertext: encryptedApiKey,
    },
    baseUrl,
    displayName,
    modelId,
    provider,
    status,
  },
  param: { kind: "chat" },
});
```

## Config Validation

Provider configs must validate:

- provider type
- base URL when relevant
- model names
- capability: `chat`, `embedding`, `rerank`
- enabled/disabled status
- timeout
- rate limits
- secret reference

Invalid or disabled provider configs must fail before network calls.

## Timeouts and Retries

Every provider call must have a timeout.

Retry only transient failures:

- rate limits
- timeout
- temporary network failure
- 5xx provider error

Do not retry:

- invalid key
- invalid request
- unsupported model
- insufficient quota when provider marks it permanent
- content policy rejection

Retries must use bounded exponential backoff with jitter and must respect provider rate limits.

## Error Normalization

Normalize vendor errors to project codes:

- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TIMEOUT`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_INVALID_REQUEST`
- `PROVIDER_UNSUPPORTED_MODEL`
- `PROVIDER_CONTENT_REJECTED`
- `PROVIDER_UNKNOWN_ERROR`

Normalized errors should include provider type, model, operation, and retryability, but not secrets or full prompt content.

Provider error codes are internal package errors. API handlers must map them to
the public API error contract in `backend/api-contract.md` before returning a
response to web clients.

## Usage Accounting

Normalize usage metadata:

```typescript
type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputCount?: number;
  model?: string;
};
```

Record usage where available for:

- chat messages
- embedding batches
- rerank calls
- provider health/status checks when meaningful

## Observability

Create spans around provider calls:

- `provider.chat`
- `provider.embedding`
- `provider.rerank`

Logs may include:

- provider type
- model
- operation
- duration
- retry count
- normalized error code

Logs must not include:

- API keys
- raw prompts by default
- full chunks by default
- full model responses by default
