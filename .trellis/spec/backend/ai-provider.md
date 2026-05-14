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
