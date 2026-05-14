# Timestamp Guidelines

These rules define time handling across PostgreSQL, API responses, logs, and UI.

## Database

Use PostgreSQL `timestamptz` for persisted timestamps.

Recommended column names:

- `created_at`
- `updated_at`
- `started_at`
- `finished_at`
- `deleted_at`
- `expires_at`

Use database defaults for creation timestamps:

```sql
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

For Drizzle schemas, use timezone-aware timestamp columns that return `Date` objects in application code.

## API Serialization

API responses serialize timestamps as ISO 8601 strings in UTC.

Example:

```json
{
  "createdAt": "2026-05-14T10:30:00.000Z"
}
```

Rules:

- API field names use camelCase.
- Database column names use snake_case.
- Convert `Date` to ISO string at API boundary.
- Do not return raw database timestamp objects to Client Components.

## Application Logic

Inside backend logic:

- Use `Date` for timestamp values.
- Use `Date.now()` only for measuring elapsed time or generating current time in application code.
- Prefer database `now()` for persisted creation/update timestamps.
- Inject clocks in tests when testing time-sensitive behavior.

## Logs

Structured logs use ISO 8601 timestamp strings.

Logs should include elapsed durations as milliseconds:

```typescript
logger.info("provider_call_finished", {
  durationMs,
  providerId,
});
```

## Audit Logs

Audit logs must store timestamp with timezone and enough precision to order events.

Audit records include:

- event timestamp
- actor id
- tenant id
- action
- target
- request id

## UI Display

UI display formatting belongs in frontend utilities, not backend responses.

Rules:

- Keep API timestamps in ISO format.
- Convert to localized display text in UI.
- Use consistent date/time formatting across list pages and detail pages.
- Avoid mixing absolute and relative time in the same table column unless intentionally designed.

## Expiration

Expiration fields such as `expires_at` use `timestamptz`.

Expiration checks should happen on the server:

```sql
expires_at > now()
```

Do not trust client clocks for authorization, session validity, signed URL validity, or provider key status.

