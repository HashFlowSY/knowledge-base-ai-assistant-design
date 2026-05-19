# Audit Log Guidelines

These rules define audit logging for security-sensitive and administrative actions.

## Ownership

- `src/packages/audit` owns audit event types, persistence helpers, and redaction rules.
- `src/apps/api` calls audit helpers for HTTP/admin actions.
- `src/apps/worker` and domain packages call audit helpers for background actions that change business state.

## Required Fields

Every audit record must include:

- `tenantId`
- `actorId`, nullable for system actions
- `actorType`: `user` or `system`
- `action`
- `targetType`
- `targetId`
- `metadata`
- `requestId`, nullable for worker/system actions
- `ipHash` or `ipSummary`, when available
- `userAgentSummary`, when available
- `createdAt`

Do not store full IP addresses if a privacy-preserving summary is enough for operations. If full IP storage is required later, document retention and access rules.

## Action Naming

Use stable dot-separated action names:

- `user.created`
- `user.updated`
- `user.access_removed`
- `user.password_reset`
- `knowledge_base.created`
- `knowledge_base.member_added`
- `document.uploaded`
- `document.url_import_requested`
- `ingestion.job_failed`
- `provider_config.created`
- `provider_config.updated`
- `provider_config.disabled`
- `system_setting.updated`
- `auth.login_failed`
- `auth.forbidden`

Action names are part of the operational contract. Do not rename existing actions without migration notes.

## Required Audit Events

Audit these events:

- Provider config create/update/disable/status check.
- User create/update/access removal/password reset.
- Knowledge base create/update/delete.
- Knowledge base membership changes.
- File upload and URL ingestion request.
- Ingestion job terminal failure.
- Admin configuration changes.
- Audit log export or privileged audit read, if added.
- Forbidden admin attempts.

## Metadata Rules

Metadata must be structured JSON and minimal.

Allowed examples:

```json
{
  "providerType": "deepseek",
  "model": "deepseek-chat",
  "enabled": true
}
```

Forbidden metadata:

- Provider keys.
- Object storage credentials.
- Database URLs.
- Full prompts.
- Full chunks.
- Full model outputs.
- Full uploaded document text.

When metadata contains user input, store identifiers or short summaries rather than raw content.

## System Actor

Worker actions should use `actorType: "system"` with `actorId: null` when no user action is directly executing the step.

If a worker is processing a user-requested job, include `requestedBy` in metadata and keep `actorType: "system"`.

## Querying Audit Logs

Audit log list APIs must:

- Require admin authorization.
- Filter by tenant.
- Support pagination.
- Support filters for action, actor, target type, and time range.
- Never return secret-bearing metadata.

## Retention

Production v1 must document retention expectations in deployment docs. Until a retention policy is explicitly implemented, audit logs are retained indefinitely.
