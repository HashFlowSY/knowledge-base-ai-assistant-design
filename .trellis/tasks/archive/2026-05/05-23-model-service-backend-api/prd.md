# 模型服务配置真实接入

## 背景与意义

本项目要打通真实 RAG 和 ingestion 链路，必须先有一个可靠的模型服务配置边界。后续向量化需要 `embedding` 模型，检索增强需要 `rerank` 模型，问答生成需要 `chat` 模型；这些调用都依赖模型 provider、模型 ID、Base URL 和 API Key。

因此，本任务不是做通用 provider CRUD，而是把产品固定的三类模型服务配置接入真实后端和 `/providers` 前端页面，并建立密钥安全、连接测试、审计和后续模型调用可复用的服务边界。

## 已确定范围

* 模型服务固定为三类：`chat`、`embedding`、`rerank`。
* `/providers` 前端页面必须接入真实 API，不再展示“等待后续真实 API 接入”，也不回退到 mock provider store。
* 后端需要提供固定三槽位的脱敏摘要读取，用于前端展示三类模型服务当前状态。
* 保存配置必须同步执行连接测试；连接测试通过后才写入本次配置和密钥变更。
* 保存接口必须幂等：同一 `tenantId + kind` 重复提交不会创建重复 provider config。
* 不提供删除接口；停用通过 `status: "disabled"` 表达。
* API Key 是大模型调用凭证，后续调用模型时必须能拿到明文，因此本地存储使用可逆加密，不使用 hash/digest。
* API 响应、前端展示、日志、审计都不能暴露明文 API Key 或 encrypted payload。

## 非目标

* 不支持任意数量 provider 配置。
* 不支持备用模型、排序、默认 provider 选择或 failover。
* 不提供 delete route。
* 不实现真实终端用户 chat/embedding/rerank 调用链路。
* 不接入 Worker/RAG 对 provider 配置的完整消费链路。
* 自动化测试不调用真实外部模型供应商。
* 不做 Vault/KMS 集成；v1 使用项目已有 `APP_ENCRYPTION_KEY` 方案。

## 主要流程

### 页面加载

`/providers` 页面调用固定槽位摘要接口，展示 `chat`、`embedding`、`rerank` 三个 slot。每个 slot 只展示安全字段，例如服务名称、provider、modelId、baseUrl、状态、masked key、key version、更新时间。

### 保存配置

管理员编辑某个固定 `kind` 的配置并保存。保存请求提交 displayName、provider、modelId、baseUrl、status，以及密钥策略。

保存时后端必须：

1. 校验管理员权限和请求输入。
2. 取得候选 API Key：首次配置必须提交密钥；更新时可保持原密钥，也可提交新密钥。
3. 使用候选配置同步执行对应能力的连接测试。连接测试不能裸 `GET baseUrl`，必须按 provider/kind 调用真实鉴权或能力端点。
4. 连接测试失败时返回安全错误，不写入本次 provider config 或 secret 变更。
5. 连接测试通过后，在事务内按 `tenantId + kind` 幂等 upsert provider config，并处理 secret record。
6. 写入安全审计事件，metadata 只包含 provider/model/status/kind 等非密钥信息。

### 后续模型调用

后续模型调用不直接读数据库密文，也不在 RAG/ingestion 里自行解密。`@kb/ai-providers` 必须提供受控的密钥解析/解密边界：按 `tenantId + providerConfigId/kind` 找到配置和 secret record，使用 `APP_ENCRYPTION_KEY` 解密出明文 API Key，仅在服务端内存中用于本次 provider 请求头。

## 功能需求

### 前端

* `/providers` 页面接入真实 API。
* 页面固定展示 `chat`、`embedding`、`rerank` 三个模型服务 slot。
* 编辑表单沿用当前产品字段：服务名称、Provider、模型 ID、Base URL、API Key、状态。
* 编辑已有配置时，API Key 留空表示保持原密钥。
* 保存按钮语义为“保存并测试”。
* 页面只展示 masked key/key version/是否已配置等安全元数据。

### API

* 提供固定三槽位脱敏摘要读取接口，例如 `GET /api/providers`。
* 提供固定 `kind` 的幂等保存接口，例如 `PUT /api/providers/:kind`。
* 所有 provider 配置接口必须 admin-only。
* 所有请求和响应使用项目统一 API envelope。
* 错误响应只能暴露安全错误码和安全中文消息。
* 不提供 delete route。

### Provider 配置服务

* `@kb/ai-providers` 负责 provider 配置 schema/type、配置校验、连接测试、密钥查找/解密边界和 provider 错误归一化。
* 每个 `tenantId + kind` 最多维护一个有效配置槽位。
* 保存配置时重复请求必须得到同一个目标状态，不能创建重复配置。
* invalid/disabled provider config 在模型调用前必须失败，不应继续发起外部 provider 请求。
* DeepSeek chat 连接测试使用 `GET <baseUrl>/models` + `Authorization: Bearer <apiKey>` 验证 token，不使用裸 `GET baseUrl`。
* 阿里云百炼/DashScope 连接测试按模型能力调用真实端点。OpenAI 兼容模式下，chat 使用 `/chat/completions`，embedding 使用 `/embeddings`，`qwen3-rerank` 使用 `/compatible-api/v1/reranks`。DashScope 原生模式下，embedding 使用 `/api/v1/services/embeddings/text-embedding/text-embedding`，`gte-rerank-v2` 使用 `/api/v1/services/rerank/text-rerank/text-rerank`。测试请求必须使用最小安全 payload，并归一化 provider 错误，不暴露原始响应体。

### 密钥处理

* 前端提交 API Key 时，接口传输阶段需要避免明文暴露在请求体中。
* 传输加密使用后端生成的短期公私钥方案：前端使用公开密钥加密 API Key，后端用短期私钥解密后再进入保存流程。
* 后端持久化 API Key 时必须使用 `AES-256-GCM`。
* `APP_ENCRYPTION_KEY` 必须是 256-bit 高熵密钥，不能由弱密码直接作为加密 key 使用。
* 每次加密必须生成新的 96-bit random IV/nonce；同一个 encryption key 下不得复用 nonce。
* 每次加密必须使用 128-bit auth tag。
* 加密必须绑定 AAD，至少包含 `tenantId`、`secretRecordId`、`purpose`、`keyVersion`，防止密文被跨租户或跨用途搬用。
* `encrypted_payload` 必须保存可解析的 envelope，至少包含 `alg`、`keyVersion`、`iv`、`tag`、`ciphertext`。
* 明文 API Key 只允许在服务端内存中短暂存在，用于连接测试或后续模型调用。
* API 响应、日志、审计、前端状态都不能包含明文 API Key 或 encrypted payload。

### 审计

* provider 配置创建、更新、停用、密钥轮换和连接测试都必须写入审计。
* 审计 metadata 只能包含安全字段，例如 kind、provider、modelId、status、测试结果。
* 审计中不能包含明文密钥、密文 payload、请求头、provider 原始错误体或完整模型响应。

## 数据约束与 Schema 调整

现有数据库已经有以下基础：

* `provider_configs.kind`: `chat | embedding | rerank`
* `provider_configs.status`: `enabled | disabled`
* `provider_configs.secretRecordId`
* `secret_records.purpose`: `provider_api_key`
* `secret_records.encryptedPayload`
* `secret_records.keyVersion`
* `secret_records.metadata`

需要做最小 schema 调整：

* `provider_configs` 需要新增 `base_url` 字段。Base URL 是页面展示、连接测试和后续 provider 调用的核心结构化字段，不应只放在 `settings` JSONB 中。
* `provider_configs` 需要新增 `tenant_id + kind` 唯一约束，直接保证每个租户每类模型服务只有一个配置槽位。
* 现有 `is_default` 字段和 `provider_configs_tenant_kind_default_idx` 属于更早的默认 provider 设计；本任务不依赖它，也不扩展默认 provider 选择。除非迁移验证要求清理，否则先保留但不作为业务语义使用。
* `secret_records` 当前字段足够承载可逆加密结果：`encrypted_payload` 保存密文 envelope，`key_version` 保存加密 key version，`metadata` 保存 masked suffix 等非敏感元数据；本任务不需要为 secret 新增字段。

如修改数据库 schema，必须保持 Drizzle schema、migration、snapshot 和相关测试同步。

## 验收标准

* [ ] `/providers` 页面展示真实 API 返回的 `chat`、`embedding`、`rerank` 三个固定模型服务 slot。
* [ ] `/providers` 页面不再展示“等待后续真实 API 接入”。
* [ ] Admin 可以保存三类模型服务配置，保存动作同步执行连接测试。
* [ ] DeepSeek 和阿里云百炼/DashScope 的连接测试按真实能力端点验证 API Key，不再裸测 `baseUrl`。
* [ ] 连接测试失败时，API 返回安全错误，且不写入本次配置或密钥变更。
* [ ] 对同一 `tenantId + kind` 重复保存不会创建重复 provider config。
* [ ] 首次配置必须提供 API Key；更新已有配置可保持原密钥。
* [ ] 提交新 API Key 时会更新加密 secret 记录，并更新 masked/key version 元数据。
* [ ] 停用通过 `status: "disabled"` 完成，不需要 delete route。
* [ ] API 响应、前端展示、日志、审计都不包含明文 API Key 或 encrypted payload。
* [ ] 模型调用需要使用 API Key 时，只能通过 `@kb/ai-providers` 的受控边界解密得到。
* [ ] 非 admin 调用 provider 配置接口会被拒绝。
* [ ] 测试覆盖 schema、API route、前端页面接入、幂等保存、连接测试失败、secret 加密/脱敏、审计和鉴权。
* [ ] 相关 lint、typecheck、test 通过。

## Definition of Done

* 后端 provider API、provider 配置服务、密钥加密/解密边界完成。
* `/providers` 前端页面完成真实 API 接入。
* 单元测试和 API/前端相关测试已补齐。
* `pnpm lint`、`pnpm typecheck`、相关 `pnpm test` 通过。
* 如修改数据库 schema，Drizzle schema、migration、snapshot 和验证命令保持一致。

## 相关文件和规范

* `src/packages/db/src/schema/provider.ts`
* `src/packages/ai-providers/src/index.ts`
* `src/apps/api/src/app.ts`
* `src/apps/api/src/runtime-services.ts`
* `src/apps/api/src/contracts/services.ts`
* `src/apps/api/src/session-guards.ts`
* `src/apps/web/src/features/admin/admin-list-page.tsx`
* `src/apps/web/src/features/admin/provider-config-dialog.tsx`
* `src/apps/web/src/features/shell/prd-contract.test.ts`
* `.trellis/spec/backend/ai-provider.md`
* `.trellis/spec/backend/api-module.md`
* `.trellis/spec/backend/api-contract.md`
* `.trellis/spec/backend/security.md`
* `.trellis/spec/backend/audit.md`
* `.trellis/spec/backend/package-boundaries.md`
* `.trellis/spec/guides/cross-layer-thinking-guide.md`
* `.trellis/spec/testing/strategy.md`
