# Frontend Functional MVP

## Goal

Build a responsive, multi-page, interactive frontend MVP for the knowledge-base AI assistant so the Next.js web app behaves like a usable Chinese enterprise product, not a static mockup. All exposed navigation links and visible buttons must either perform a real frontend action with local/mock state, navigate to an implemented page, or be explicitly disabled with precise copy.

## What I Already Know

* The product is an enterprise knowledge-base AI assistant for private deployment.
* Production v1 UI language is Chinese; no i18n framework is planned for v1.
* The existing product design lists these v1 frontend areas: login, knowledge base list/detail, file upload and URL import, chat Q&A with citations and feedback, user management, task queue status, document processing logs, and Provider/key configuration.
* The current web app is a minimal Next.js bootstrap page at `src/apps/web/src/app/page.tsx`.
* Existing web stack: Next.js 16 App Router, React 19.2, strict TypeScript, Tailwind CSS, shadcn/ui conventions, TanStack Query, lucide-react, and URL query parameters for list state.
* The repo uses pnpm workspaces and Turborepo. Frontend commands exist for `dev`, `build`, `typecheck`, `lint`, and `test`.
* Current e2e coverage only verifies the bootstrap status page.
* 2026-05-15 implementation showed the previous PRD language was too weak: "static/clickable prototype" allowed navigation placeholders and non-functional buttons. The revised requirement is now a functional frontend MVP with mock/local state.
* 2026-05-15 PRD review found the revised scope is valid but too broad without phasing, a shared mock data contract, explicit mock session rules, skeleton verification requirements, and a stronger test matrix.

## Assumptions (Temporary)

* This task is first about a frontend-only MVP, not backend/API integration.
* The implementation should use realistic mock data and local/browser state where API contracts are not available yet.
* The UI should feel like an operational SaaS/admin tool: dense, restrained, scan-friendly, and focused on repeated work.
* Admin-only areas should be implemented as functional frontend pages with mock role behavior; real API enforcement remains a later backend concern.
* Frontend mock business data and mock session/role state use a single frontend mock store persisted in `localStorage` under a clearly named session/mock namespace. Page-local React state is reserved for temporary UI state such as dialog visibility, selected rows, form drafts, pending flags, and open drawers.
* Visual companion is enabled for layout and style questions; text-only discussion remains preferred for scope and product decisions.

## Open Questions

* None. The user clarified that the deliverable must be a responsive, complete, interactive frontend MVP. The previous static-prototype scope is superseded.

## Requirements

* Use Chinese UI copy with consistent domain terms: `知识库`, `文档`, `任务`, `处理日志`, `引用`, `反馈`, `模型服务`, `密钥`, `审计日志`.
* Keep UI copy centralized by feature or shared module instead of scattered through components.
* Default to Server Components; introduce Client Components only for interactivity, hooks, or browser APIs.
* For list/table screens, reflect pagination, search, sorting, and filters in URL state.
* Include loading, empty, error, and disabled action states in the implementation where the relevant view can enter those states through mock/local state.
* All route-level and component-level asynchronous/loading boundaries must provide skeleton fallbacks, not plain text-only loading messages.
* The app must include a reusable skeleton system for repeated surfaces: page shell, navigation, cards, metrics, forms, table/list rows, detail drawers, chat messages, citation cards, and document chunks.
* Next.js route segments that can suspend or simulate data loading must define `loading.tsx` or an equivalent Suspense fallback using the same skeleton visual language.
* Skeleton fallbacks must preserve final layout dimensions closely enough to avoid major layout shift when real/mock content appears.
* Use semantic controls and accessible labels.
* Preserve future expansion for ingestion connectors, provider types, audit detail views, and multi-tenant capability without implementing them in v1 UI scope.
* Deliver a responsive multi-page frontend MVP in Next.js using real routes/components and mock/local state, without real backend authentication/API integration.
* Every global navigation item must route to an implemented page, not a 404 or placeholder-only screen.
* Every visible button must be functional, disabled with a reason, or open a implemented local-state dialog/drawer. No inert buttons.
* Forms must be usable with local validation and mock submission outcomes. Successful mock submissions must update visible local/mock state when that is the expected user result.
* Use a responsive app shell:
  * Desktop: persistent global sidebar and dense page content.
  * Tablet: collapsed or compact navigation with content still readable without horizontal scrolling.
  * Mobile: usable top/bottom navigation or drawer pattern, single-column content, touch targets at least 44px, no text overflow.
* Implement the knowledge-base workspace page group: sidebar navigation, knowledge base list/detail, file upload flow, URL import flow, task status entry, document list, and document detail links.
* Use a three-column workspace layout on desktop: global sidebar navigation, knowledge base selector/list column, and main detail/action column. Collapse to a single-column workflow on mobile.
* Use a restrained operational visual direction: white and light-gray surfaces, clear borders, high-density layout, teal primary actions, and precise enterprise Chinese copy.
* MVP includes complete frontend pages for the current core product flow: login, knowledge-base workspace, document/source detail, task queue, processing logs, chat Q&A, provider configuration, user management, audit logs, and unauthorized/session-expired states.
* Adjacent features may use mock data, but they must be implemented as pages with functional navigation, filters, drawers/dialogs, and local interaction states.
* Implement Chat Q&A as a functional frontend page: session list, knowledge base selection context, question composer, answer reading area, citation review, and feedback entry.
* Use a chat Q&A layout with global navigation, conversation/session list, central chat transcript and composer, and a fixed right citation/feedback side panel.
* Chat Q&A must cover and allow users to trigger key answer lifecycle states with mock/local state: empty/waiting for input, retrieval in progress, answer generation in progress, completed answer with citations, completed answer with no citation warning, and failed answer with retry.
* Chat Q&A citation panel should show source card details: snippet summary, document name, page number or URL, and match/relevance reason.
* Chat Q&A feedback must support useful/not useful plus an optional reason entry point, save the feedback in local/mock state, and show a submitted state.
* Implement the admin/operations page group: user management, task queue status, document processing logs, Provider/key configuration, and audit logs.
* Admin/operations pages use a shared list/table plus right-side detail drawer model.
* Admin/operations pages must be implemented at usable interaction depth: per-page columns, filters, drawer content, row and batch actions where specified, confirmations, empty/error/loading states, and admin/member permission differences through local/mock role state.
* Implement login and entry pages. Login uses email/password mock authentication, keeps SSO/OAuth/password recovery as disabled future placeholders, routes successful login through `redirectTo` when present, and provides restrained unauthorized/session-expired states.
* Implement document/source deep pages with document details, source preview, chunk/fragment list, citation return target, and processing log entry points.
* The app must have at least one coherent happy-path flow that works end to end with mock/local state: login -> select/create/import into knowledge base -> inspect task/document status -> ask a question -> inspect citations -> submit feedback.

## Implementation Phasing

The full MVP remains a single product goal, but implementation must be phased so each phase is independently reviewable and testable.

### P0 - Foundation And Shell

Scope:

* Responsive app shell with desktop sidebar, tablet compact navigation, and mobile navigation.
* Mock session provider with deterministic `admin`/`member` role switching.
* Centralized copy structure and shared mock data contract.
* Shared UI primitives: buttons, badges, dialogs/drawers, list shell, table/card responsive rows, toast/notice pattern, and skeleton system.
* Route-level `loading.tsx` or Suspense fallback strategy for all implemented route groups.
* Product `not-found` and `/unauthorized` pages.

Exit criteria:

* Navigation works across implemented shell routes without 404.
* Role switch updates visible navigation and direct admin route behavior.
* Skeleton primitives render at desktop and mobile widths.
* No visible shell button is inert.

### P1 - Core Knowledge And Chat Flow

Scope:

* `/login`, `/workspace`, `/documents`, `/documents/[documentId]`, and `/chat`. `/` redirects to `/workspace`.
* Knowledge-base selection, admin-only create dialog, upload dialog, URL import dialog, document list, task/document state update after mock import.
* On the workspace page, the document module, task summary module, and processing-log summary module share one desktop row with consistent module height for admin users. For member users, the document module and task summary module share one desktop row with consistent module height because processing logs are hidden.
* Knowledge-base workspace processing-log summary and `/logs` entry are admin-only. Member users can see task status from the workspace, but the workspace must not render processing-log cards or processing-log navigation/actions for member users.
* Document detail with source preview, chunk list search/filter, chunk drawer, related task/log links, and citation return highlighting.
* Chat session list, new session, starter prompt, question submission, deterministic mock lifecycle, citation selection, citation-to-document navigation, retry, and answer-level feedback.

Exit criteria:

* End-to-end mock happy path works: login -> import/create content -> inspect document/task status -> ask question -> inspect citation -> submit feedback.
* Loading, empty, error, disabled, and skeleton states exist and are reachable where practical through controls, page transitions, or short mock delays. Skeleton presence is required; tests do not need to reliably freeze every route-level skeleton frame.
* Desktop and mobile browser inspection show no overflow, clipped controls, or unreadable text.

### P2 - Admin And Operations Pages

Scope:

* `/tasks` operation monitoring is visible to admin and member users.
* `/logs`, `/providers`, `/users`, and `/audit` remain admin-only.
* Shared admin list/table shell with URL search/filter/sort/pagination state.
* Row detail drawers, confirmation dialogs, local mutations, disabled pending states, empty/error/loading states, and skeletons.
* Permission behavior for admin/member navigation, direct route access, and task action authorization.

Exit criteria:

* Each admin/operations page supports search/filter/sort changing visible rows.
* Row selection opens a detail drawer with selected-row data.
* High-impact actions require confirmation and mutate local state.
* Member role can access `/tasks` through navigation and direct URL, but retry/cancel task actions are disabled with a visible reason.
* Member role cannot access admin-only pages (`/logs`, `/providers`, `/users`, `/audit`) through navigation or direct URL without `/unauthorized`.

### P3 - Polish, Verification, And Hardening

Scope:

* Responsive pass across all pages.
* Accessibility pass for labels, focus order, dialogs/drawers, disabled reasons, and keyboard navigation.
* Copy consistency pass for required Chinese terms.
* Test matrix completion and browser inspection evidence.

Exit criteria:

* `pnpm --filter @kb/web test`, `typecheck`, `lint`, and `build` pass.
* Playwright tests pass when browser binaries are available, or the exact runtime blocker is documented.
* Final implementation satisfies all Acceptance Criteria and Explicitly Not Acceptable items.

## Mock Data Contract

All functional pages must use one shared frontend mock domain model, not independent page-local fixtures that cannot connect into a workflow.

Entity ids:

* Use stable string ids: `kb-finance`, `doc-travel-policy`, `chunk-travel-001`, `job-import-001`, `log-import-001`, `session-finance-001`, `citation-travel-001`, `provider-openai-main`, `audit-provider-001`, `user-admin-001`.
* URLs and search params may carry these ids for deep links: `knowledgeBaseId`, `documentId`, `jobId`, `logId`, `chunkId`, `citationId`, `sessionId`, `targetId`.

Required entities:

* `MockUser`: id, name, email, role `admin | member`, emailVerified, status, createdAt, updatedAt.
* `MockSession`: userId, role, sessionExpired flag, intendedRedirectTo.
* `MockKnowledgeBase`: id, name, description, status, owner, visibility, documentIds, createdAt, updatedAt.
* `MockDocument`: id, knowledgeBaseId, title, sourceType `file | url`, status, version, sourceId, chunkIds, jobIds, createdBy, createdAt, updatedAt.
* `MockSource`: id, documentId, file metadata or URL metadata, hash summary, processing status.
* `MockChunk`: id, documentId, index, tokenEstimate, locator, summary, content, contentHash, sanitizedMetadata.
* `MockIngestionJob`: id, documentId, knowledgeBaseId, sourceType, status, currentStep, attempts, maxAttempts, requestedBy, queuedAt, finishedAt, lastError, logIds.
* `MockProcessingLog`: id, jobId, documentId, knowledgeBaseId, level, step, message, errorCode, requestId, metadataSummary, createdAt.
* `MockChatSession`: id, knowledgeBaseId, title, messages, selectedAnswerId, createdAt, updatedAt.
* `MockChatMessage`: id, sessionId, role `user | assistant`, lifecycle state, content, citationIds, feedback.
* `MockCitation`: id, answerMessageId, documentId, chunkId, title, locator, excerpt, matchReason.
* `MockProviderConfig`: id, displayName, kind `chat | embedding | rerank`, provider, modelId, status, isDefault, maskedKeySuffix, keyVersion, updatedAt.
* `MockAuditEvent`: id, actorId, actorType, action, targetType, targetId, requestId, ipSummary, userAgentSummary, sanitizedMetadata, createdAt.

Mock enum values:

* `MockUser.status`: `active | disabled | pending`.
* `MockKnowledgeBase.status`: `ready | processing | failed | empty`.
* `MockKnowledgeBase.visibility`: `private | shared`.
* `MockDocument.status`: `ready | processing | failed | empty`.
* `MockSource.processingStatus`: `queued | running | succeeded | failed | cancelled`.
* `MockIngestionJob.status`: `queued | running | succeeded | failed | cancelled`.
* `MockIngestionJob.currentStep`: `queued | fetching | parsing | chunking | embedding | indexing | completed | failed`.
* `MockProcessingLog.level`: `info | warning | error`.
* `MockProcessingLog.step`: matches `MockIngestionJob.currentStep` when applicable.
* `MockChatMessage.lifecycle`: `idle | retrieving | generating | completed | no_citation | failed`.
* `MockProviderConfig.status`: `enabled | disabled | testing | error`.
* `MockAuditEvent.actorType`: `user | system`.
* `MockAuditEvent.targetType`: `knowledge_base | document | ingestion_job | provider | user | chat_message | session`.
* `MockAuditEvent.action`: use a finite frontend enum covering required local mutations, including `knowledge_base.create`, `document.import`, `job.retry`, `job.cancel`, `chat.feedback.submit`, `provider.enable`, `provider.disable`, `provider.rotate_key`, `provider.set_default`, `provider.test_connection`, `user.invite`, `user.role_change`, `user.disable`, and `session.expire`.

Required relationships:

* Knowledge base -> documents -> chunks.
* Document -> source, ingestion jobs, processing logs.
* Ingestion job -> processing logs and related document.
* Chat answer -> citations -> document/chunk.
* Provider/user/task mutations -> append or reveal related audit-style summary.

Required local mutations:

* Admin-created knowledge bases add a visible knowledge-base row and become selected.
* Member users cannot create knowledge bases. The create affordance must be disabled with a visible reason, and the mock state mutation must ignore non-admin create attempts to prevent duplicate knowledge bases.
* Uploading a file adds a mock document, a queued/processing job, and related log entries.
* Importing a URL adds a mock URL document, a queued/processing job, and related log entries.
* Retrying a failed job updates status/attempts and appends a log entry.
* Cancelling a queued/running job updates status and disables retry/cancel appropriately.
* Submitting a chat question creates a user message, then deterministic assistant lifecycle states ending in either cited answer, no-citation warning, or failure depending on selected demo control/input.
* Submitting feedback updates the answer's feedback state and shows submitted copy.
* Changing a user role, disabling a user, enabling/disabling provider, rotating key, setting provider default, and mock testing provider connection update local state and show audit-style feedback.

Mock localStorage rules:

* Use one clearly named frontend-only storage key for mock state, recommended as `kbai.frontendMock.v1`.
* Persist a `schemaVersion` field with value `1`.
* First load initializes from deterministic seed data when the storage key is absent.
* A visible mock/development control must allow reviewers to reset demo data back to the seed state.
* If persisted state is missing required top-level collections, has an unsupported `schemaVersion`, or fails JSON parsing, the app must discard it and recover to seed data with a non-raw user-facing notice.
* Automated tests may clear this storage key before a scenario to guarantee deterministic starting state.

## Mock Session And Permission Rules

* Mock session state is owned by the frontend app shell and persists to `localStorage` so refresh behavior is deterministic during review.
* Mock business data also persists temporarily in `localStorage` for this frontend MVP, including knowledge bases, documents, tasks, logs, chat sessions/messages, provider configs, users, and audit events. This is frontend-only review storage, not a real persistence contract.
* Default mock login accepts a documented demo admin account and a documented demo member account. Invalid credentials show sanitized validation/auth errors.
* `redirectTo` is honored after login when it points to an internal route. Invalid external redirect targets are ignored and fallback to the workspace.
* Admin role sees all navigation and admin actions.
* Member role sees workspace, documents, chat, tasks, and allowed document/source content. Member role does not see logs, providers, users, audit, or admin-only actions.
* Direct access to admin-only routes as member routes to `/unauthorized` or renders the unauthorized state in the same shell. The behavior must be deterministic and tested.
* Session expired state is reachable through a mock control or query param and preserves the intended route.
* A visible development/mock role switcher must exist for review and testing, but it must be presented as a mock control and not as production role-management UX.

Route access matrix:

* `/login`: unauthenticated users can access; authenticated users redirect to the intended internal route or `/workspace`.
* `/workspace`, `/documents`, `/documents/[documentId]`, `/chat`, and `/tasks`: unauthenticated users redirect to `/login?redirectTo=<internal-path>`; admin and member users can access.
* `/logs`, `/providers`, `/users`, and `/audit`: unauthenticated users redirect to `/login?redirectTo=<internal-path>`; admin users can access; member users do not see navigation entries and direct access routes to `/unauthorized` or renders the unauthorized shell state.
* `/unauthorized`: admin and member users can access; unauthenticated users redirect to login unless the page is rendered as part of a login failure flow.
* `/`: redirects to `/workspace`; normal protected-route handling then applies.

## Acceptance Criteria

* [ ] The app has implemented routes for login, workspace, chat, documents/document detail, tasks, logs, providers, users, audit, unauthorized, and not-found states.
* [ ] All global navigation links route to implemented pages and highlight the active section.
* [ ] The layout is responsive across desktop, tablet, and mobile without horizontal overflow, clipped controls, or unreadable text.
* [ ] Long page display modules use bounded in-module scrolling for lists, summaries, transcripts, citations, drawers, and detail content so filters, pagination, and input controls remain reachable.
* [ ] Knowledge-base workspace supports selecting knowledge bases, admin-only mock knowledge-base creation, disabled member create state, opening upload and URL import dialogs, validating inputs, submitting mock imports, and updating the visible document/task state. Desktop workspace summary modules render in one row with consistent height: document/task/log for admin and document/task for member. Member users do not see workspace processing-log summaries or `/logs` entry points.
* [ ] Chat supports session selection/new session, knowledge-base scope display, question submission, mock answer lifecycle states, citation selection, citation-to-document navigation, retry on failure, and answer-level feedback submission.
* [ ] Admin/operations pages support search/filter/sort controls in URL state, row selection detail drawers, confirmations for high-impact actions, and local/mock action results.
* [ ] Login supports email/password mock validation, loading state, sanitized error state, redirectTo handling, session-expired notice, and unauthorized/admin-member role behavior.
* [ ] Document/source detail supports source preview, chunk list search/filter, chunk drawer, processing summary, related task/log links, and citation return target highlighting through URL state.
* [ ] Loading, empty, error, and disabled states are reachable through controls or explicit state toggles in the frontend-only MVP.
* [ ] Route-level loading states use skeleton fallback UIs through `loading.tsx` or Suspense fallback; no route may show only raw text such as "加载中".
* [ ] Component-level loading states use skeleton variants matching the final component shape: cards, tables, drawers, forms, chat transcript, citation panel, and chunk list.
* [ ] Skeleton fallbacks are responsive and do not introduce layout jump, horizontal overflow, clipped controls, or inaccessible focus traps.
* [ ] No visible button is inert. Each button either changes state, opens a dialog/drawer, submits a mock form, navigates, or is disabled with visible/accessible reason.
* [ ] The implementation follows existing frontend stack and Trellis frontend specs.
* [ ] The implementation has route/component boundaries that can later connect to real API/auth without rewriting the page structure.
* [ ] A shared mock data contract drives all functional pages; no required workflow is faked with disconnected page-local data.
* [ ] E2E or component tests cover the required test matrix, including the core happy path and representative failure/empty states.

## Definition of Done

* PRD is updated with the revised functional MVP scope, approach, acceptance criteria, and out-of-scope items.
* All currently identified functional page groups are implemented, not only described: knowledge-base workspace, chat Q&A, admin/operations, login/entry, and document/source deep pages.
* Implementation uses mock/local state for behavior that lacks backend contracts, with clear boundaries for later API replacement.
* `pnpm --filter @kb/web test`, `pnpm --filter @kb/web typecheck`, `pnpm --filter @kb/web lint`, and `pnpm --filter @kb/web build` pass.
* Relevant Playwright tests pass locally when browser binaries are available. If the browser runtime is missing, the exact blocker is reported and non-browser checks still pass.
* Browser inspection confirms the app is usable at desktop and mobile widths.

## Technical Approach

The implementation should replace the bootstrap screen with a frontend-only, responsive, multi-route MVP. It should not depend on backend readiness, but it must still behave like working software by using mock data, local component state, and URL state. The right mental model is "API-ready functional frontend shell", not "static visual prototype".

Route boundaries:

* `/login` - mock email/password login and entry states.
* `/workspace` - canonical knowledge-base workspace.
* `/` - redirects to `/workspace`.
* `/chat` - Q&A, sessions, composer, lifecycle states, citations, and feedback.
* `/documents` - document list scoped from workspace/search.
* `/documents/[documentId]` - document/source/chunk detail page.
* `/tasks` - ingestion task queue.
* `/logs` - document processing logs.
* `/providers` - Provider/key configuration.
* `/users` - user management.
* `/audit` - audit logs.
* `/unauthorized` - no-access state.
* `not-found` - restrained product not-found state.

Component boundaries:

* App shell: responsive navigation, account/role switcher or mock session summary, active nav state, and protected-page framing.
* Skeleton system: shared primitives for `SkeletonBlock`, `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `SkeletonDrawer`, and page-specific skeleton compositions.
* Mock data and copy modules: feature-scoped data factories and centralized Chinese copy under `src/apps/web/src/copy/` or feature-local `data.ts` files.
* Knowledge-base feature: list, detail, create dialog, upload dialog, URL import dialog, document summary, task summary, and state reducers/helpers.
* Chat feature: session list, transcript, composer, lifecycle controls, citation panel, feedback form, and citation navigation.
* Admin list feature: shared list/table shell, filter controls, URL-state helpers, row actions, confirmation dialog, and detail drawer.
* Document feature: source preview, chunk list, chunk drawer, related tasks/logs, and citation return handling.
* Auth feature: login form, mock session state, redirectTo handling, session-expired and unauthorized views.

Canonical routes:

* `/workspace` is the canonical knowledge-base workspace route.
* `/` redirects to `/workspace`.
* Global navigation highlights workspace when the current path is `/workspace` or after `/` resolves to `/workspace`.
* Auth redirects, `redirectTo`, smoke tests, and document/chat/task links should target `/workspace` instead of mixing `/` and `/workspace`.

State model:

* Use the shared mock data contract for initial render and all page interactions.
* Use Client Components only where interaction is required: selected rows, dialogs/drawers, form submissions, mock mutations, role/session state, chat lifecycle, feedback, and URL state updates.
* Simulated async states should have deterministic controls or short predictable delays only where needed to demonstrate skeletons and disabled states.
* Use URL search params for list page state: `search`, `sort`, `page`, `pageSize`, and page-specific filters.
* Use URL search params for deep-link state where useful: selected document, selected job/log, selected citation/chunk, and `redirectTo`.
* Use the shared mock store for business mutations such as creating a knowledge base, adding a document import, retrying/cancelling a task, changing a provider status, rotating a key, changing a role, and submitting chat feedback.
* Persist the shared mock store to `localStorage` for temporary review continuity. The persisted shape must be isolated behind a clearly named frontend-only mock store boundary so it can later be replaced by real APIs without rewriting feature components.
* Use page-local React state only for temporary UI state: form drafts, dialog/drawer visibility, selected table rows, optimistic pending flags, and local display toggles.
* Do not use real internal API calls, real auth sessions, real streaming, provider calls, queue calls, or database persistence in this task. The UI should still show the result of actions in local/mock state.

Mock store boundaries:

* A single frontend mock store or reducer owns cross-page workflow state and is the source of truth for frontend mock business entities.
* Feature components receive typed mock data and mutation callbacks instead of importing unrelated page fixtures.
* URL state identifies selected/filter state; the mock store owns entity data.
* Mock mutation names should describe future API intent, such as `createKnowledgeBase`, `submitUrlImport`, `retryIngestionJob`, `submitChatFeedback`, or `rotateProviderKey`.

Responsive behavior:

* Desktop: persistent left navigation, dense content, table/drawer layouts.
* Tablet: compact sidebar or top navigation with drawers still usable.
* Mobile: single-column pages, nav accessible through a menu, dialogs/drawers fit viewport, tables collapse to stacked rows/cards, and controls remain at least 44px high.
* Display modules with potentially long content must use bounded internal scroll areas. Apply this to knowledge-base/document lists, admin rows, chat transcript, citation panel, task/log summaries, chunk lists, and detail drawers; avoid moving filters, pagination, or form controls inside the scrolling region unless they are part of the content itself.

Quality approach:

* Keep Server Components as the default and push Client Components down to interactive islands.
* Preserve centralized Chinese copy.
* Avoid adding a table state library; build lightweight shared list/table patterns.
* Verify skeleton fallbacks by inspecting route-level loading surfaces and component-level loading toggles at desktop and mobile widths.
* Verify with unit/component tests, Playwright for core flows when available, lint, typecheck, build, and browser inspection at desktop/mobile widths.

Skeleton requirements by surface:

* App shell: navigation/sidebar skeleton must keep the final shell width and active-section area stable.
* Workspace: knowledge-base list skeleton, knowledge-base detail skeleton, metric card skeletons, document list skeleton, upload/import dialog submitting skeleton or busy state.
* Chat: session list skeleton, transcript message skeletons, composer disabled state, citation side-panel skeleton, feedback submission busy state.
* Admin/operations: filter toolbar skeleton, table row skeletons, pagination skeleton, right drawer skeleton, confirmation mutation busy state.
* Login: form submission busy state with disabled controls and progress indicator; initial page fallback should keep the centered form layout stable.
* Document/source detail: header skeleton, source preview skeleton, chunk list skeleton, chunk drawer skeleton, related task/log skeleton.

Route-level skeleton requirements:

* `/login/loading.tsx` or equivalent fallback: centered login frame skeleton.
* `/loading.tsx` or workspace route fallback: app shell plus workspace list/detail skeleton.
* `/chat/loading.tsx`: shell, session list, transcript, composer, and citation panel skeleton.
* `/documents/loading.tsx`: shell, filter toolbar, document rows/cards skeleton.
* `/documents/[documentId]/loading.tsx`: document header, source preview, chunk list, and drawer placeholder skeleton.
* `/tasks/loading.tsx`, `/logs/loading.tsx`, `/providers/loading.tsx`, `/users/loading.tsx`, `/audit/loading.tsx`: shared admin list/table skeleton plus drawer placeholder.
* `/unauthorized` and `not-found` do not need heavy skeletons unless they suspend, but must preserve shell layout if rendered inside the app shell.

Fallback behavior for partial browser capabilities:

* Copy actions must show success when Clipboard API succeeds.
* If Clipboard API is unavailable or denied, show a non-raw, user-facing failure notice and keep the copy button usable for retry.
* "Open related target" actions must either navigate to an implemented route or be disabled with a visible reason when no target exists.
* "Where practical" audit-style summaries are required for all local mutations that correspond to admin/security actions: provider changes, user role/access changes, task retry/cancel, and key rotation.

## Test Matrix

Minimum automated coverage:

* Route smoke: `/login`, `/workspace`, `/chat`, `/documents`, one `/documents/[documentId]`, `/tasks`, `/logs`, `/providers`, `/users`, `/audit`, `/unauthorized`, and not-found render without 404 for intended routes. `/` redirects to `/workspace`.
* Navigation: global navigation links route to implemented pages and active nav state updates.
* Auth/session: valid admin login honors internal `redirectTo`; invalid login shows sanitized error; member role can access `/tasks` but cannot access admin-only routes; session expired state preserves intended route.
* Workspace flow: select knowledge base, create mock knowledge base as admin, verify member create is disabled/ignored, submit file upload, submit URL import, see document/job/log state update.
* Chat flow: start new session, submit question, observe deterministic retrieval/generation state, completed cited answer, select citation, navigate to document/chunk, submit feedback.
* Admin list flow: search/filter/sort changes visible rows and URL state on at least one representative list; row click opens detail drawer; destructive/high-impact action opens confirmation and mutates local state.
* Skeleton states: route-level skeleton files/fallbacks exist for the required routes, and component-level skeletons appear for table/list, chat, and document detail surfaces. Automated tests only need to verify skeleton presence where it can be observed reliably without freezing route transitions.
* Empty/error states: at least one list empty state and one error/retry state are reachable and verified.
* Responsive smoke: desktop and mobile viewport checks for shell, workspace, chat, admin list, and document detail show no horizontal overflow or clipped primary controls.

Automated test depth:

* All required routes need smoke coverage.
* The core happy path needs automated coverage when the local browser/runtime supports it.
* P2 admin/operations pages must be functionally complete for manual review, but automated list-flow coverage may use one representative page for search/filter/sort, drawer, confirmation, and mutation behavior.
* Page-specific P2 differences such as provider key rotation, user role change, task retry/cancel, and audit target opening can be covered by focused component/unit tests or manual browser inspection instead of full E2E for every admin page.

Manual/browser inspection checklist:

* Desktop, tablet, and mobile widths for each P1 page and one representative P2 page before P2 completion.
* Dialog/drawer focus behavior and close behavior.
* Touch target sizing on mobile.
* Chinese copy consistency for required domain terms.
* No plaintext secrets, raw provider errors, or unsanitized audit metadata.

## Additional Page Designs

### Chat Q&A (Confirmed)

Goal: design the core end-user asking experience that completes the knowledge-base workflow after content has been imported.

Required concepts:

* Conversation/session list.
* Current knowledge base scope selector or visible scope summary.
* Main chat transcript with user questions and assistant answers.
* Citation list or citation side panel that lets users inspect sources behind an answer.
* Feedback entry for generated answers.
* Streaming, retrieval, and citation behavior represented through deterministic mock/local state, without real streaming or RAG calls.

Layout decision:

* Use the fixed citation side panel layout: global navigation, session list, chat transcript/composer, and right-side citation/feedback panel.
* Keep the current knowledge base scope visible in the chat header, with a selector or compact summary that can later connect to the knowledge base permissions/filtering model.
* Keep citations visible alongside the selected answer so users can verify sources without opening a drawer for every answer.

Lifecycle states:

* Empty/waiting for input: show selected knowledge base scope and concise starter prompts.
* Retrieval in progress: show that the system is searching authorized knowledge bases before answer generation, with transcript and citation-panel skeletons.
* Answer generation in progress: show partial answer space, assistant-message skeleton/stream placeholder, and disabled/working composer controls.
* Completed with citations: show answer, citation count, source cards in the right panel, and feedback controls.
* Completed with no citations: show a restrained warning that the answer has no supporting source and should be treated cautiously.
* Failed answer: show failure copy with request id placeholder and retry action.

Interaction requirements:

* Right-side citation cards show source title, document type/source, page number or URL when available, a short excerpt/summary, and a concise match reason.
* Selecting a citation shows its card as active in the side panel and exposes a link to the related document detail route.
* Feedback is answer-level: useful/not useful controls plus an optional reason entry point. Submitting feedback updates the visible answer state.
* New session, session selection, retry, and starter prompt actions must work through local state.
* Detailed per-citation feedback, copy citation actions, original document deep-link positioning, and answer/citation linked highlighting are deferred.

### Admin And Operations Pages (Confirmed)

Goal: design the shared management surface for admin-only and operations-heavy pages without adding a table state library.

Pages:

* User management.
* Task queue status.
* Document processing logs.
* Provider/key configuration.
* Audit logs.

Shared constraints:

* Use the same global shell and restrained operational visual direction.
* Use lightweight table/list patterns with search, filters, sort, pagination or cursor pagination as appropriate.
* Keep high-volume logs compact; details open in drawer/dialog rather than inline metadata expansion.
* Admin-only actions are visible only to admin designs and must still be API-enforced later.
* Provider keys are never shown in plaintext; UI shows masked values and audit-relevant metadata.

Layout decision:

* Use a shared list/table page shell with title, description, primary action, search, filters, sort, pagination or cursor controls, and row actions.
* Row selection opens a right-side detail drawer/dialog for metadata, raw error summaries, audit metadata, provider status, or user/account details.
* Avoid inline expansion for large metadata and logs.
* Use the same pattern across users, tasks, document logs, providers, and audit logs, with page-specific columns and filters.

Shared states and permissions:

* Loading: table skeleton with disabled filter controls where data is required.
* Empty: domain-specific empty copy and one primary next action when applicable.
* Error: concise error copy, request id placeholder, and retry action.
* Disabled actions: pending mutations disable affected row actions and primary buttons.
* Confirmation dialogs: required for destructive or high-impact actions such as disabling users, cancelling tasks, disabling providers, or rotating provider keys.
* Admin users see management actions. Member users see `/tasks` for status monitoring, but do not see admin-only pages in navigation. Direct member access to admin-only routes must render `/unauthorized` or the unauthorized shell state in this frontend MVP; real API rejection remains later backend work.
* Pagination: normal lists use page/pageSize; high-volume logs and audit logs may use cursor pagination.
* URL state: search, filters, sort, page/pageSize or cursor are reflected in the URL.
* Search/filter/sort controls must change visible rows using mock/local data.
* Row clicks must open detail drawers with the selected row's data.
* Row and batch actions must either mutate local state or open confirmation dialogs that do.
* Empty and error states must be reachable by controls or state toggles so they can be visually verified.

User management page:

* Purpose: manage fixed Production v1 users and roles without custom role management.
* Columns: user name, email, role, email verification status, status/session indicator, created time, last updated time, row actions.
* Filters: role (`admin`, `member`), email verified, status, search by name/email, sort by created/updated/name.
* Drawer: profile summary, role/membership summary, recent session metadata summary, created/updated timestamps, audit-relevant actions.
* Actions: invite/add user through mock dialog, change fixed role, disable/remove access, reset session through local state.
* Batch actions: disabled by default for v1 unless API support is explicit; single-row actions must work.
* Confirmations: changing role and removing access require confirmation with precise copy.
* Empty state: no users beyond current admin, prompt to invite user.
* Error state: "用户列表加载失败，请重试。" with request id placeholder.

Task queue status page:

* Purpose: monitor ingestion jobs across file and URL sources.
* Columns: job/document title, knowledge base, source type, status, current step, attempts, queued time, duration/finished time, requested by, row actions.
* Filters: status, current step, source type, knowledge base, requested by, date range, search by document/job id, sort by queued/updated/status.
* Drawer: job timeline, current step, attempts/max attempts, last error code/message, source hash summary, metadata summary, related document and knowledge base links.
* Actions: open document and inspect task status for admin/member; retry failed job and cancel queued/running job for admin only. Retry/cancel update local task state, while member attempts remain disabled with a visible reason.
* Batch actions: retry selected failed jobs and cancel selected queued jobs; both require confirmation.
* Empty state: no tasks, point users to file upload/URL import.
* Error state: "任务队列加载失败，请重试。" with request id placeholder.

Document processing logs page:

* Purpose: inspect ingestion log events without rendering large metadata inline.
* Columns: time, level, step, message summary, job/document, knowledge base, error code, row actions.
* Filters: level, step, job id, knowledge base, document, date range, error code, search message, sort by time.
* Drawer: full message, structured metadata summary, error code, related job timeline link, tenant/request context if available.
* Actions: open related job, copy log id/request id with Clipboard API success/failure notice, retry job only through related job action.
* Batch actions: none by default because logs are append-only.
* Pagination: cursor pagination preferred due high volume.
* Empty state: no logs for selected filters.
* Error state: "处理日志加载失败，请重试。" with request id placeholder.

Provider/key configuration page:

* Purpose: configure chat, embedding, and rerank providers while keeping secrets masked.
* Columns: display name, kind, provider, model id, status, default marker, key status/masked suffix, updated time, row actions.
* Filters: kind (`chat`, `embedding`, `rerank`), status, default, provider, search display/model, sort by updated/name/kind.
* Drawer: provider settings summary, status, default usage, masked key metadata, key version, created by, created/updated timestamps, recent audit summary.
* Actions: add provider config, edit settings, set as default, enable/disable, rotate key, and mock test connection. These update local state and append visible audit-style summary.
* Batch actions: none for key/provider security operations.
* Confirmations: disable provider, rotate key, and set default require confirmation.
* Secret rule: never display plaintext API keys, encrypted payloads, or raw provider errors.
* Empty state: no provider configured, prompt to add required provider.
* Error state: "模型服务配置加载失败，请重试。" with request id placeholder.

Audit logs page:

* Purpose: review admin and system actions with sensitive metadata protected.
* Columns: time, actor, actor type, action, target type, target id summary, request id, IP summary, row actions.
* Filters: actor, actor type, action, target type, target id, request id, date range, search metadata summary, sort by time.
* Drawer: full audit event summary, actor details, action/target, sanitized metadata tree, request id, IP/user-agent summaries.
* Actions: open related target when it maps to an implemented route, disable the action with a visible reason when no implemented target exists, and copy request id with Clipboard API success/failure notice.
* Batch actions: none; audit logs are append-only.
* Pagination: cursor pagination preferred due append-only volume.
* Empty state: no audit events for selected filters.
* Error state: "审计日志加载失败，请重试。" with request id placeholder.

### Login And Entry Pages (Confirmed)

Goal: design the access entry experience and post-login landing behavior without expanding authentication scope beyond Production v1 decisions.

Known constraints:

* Better Auth is the planned authentication framework.
* Roles are fixed to `admin` and `member`.
* No custom role management page.
* Existing local schema supports Better Auth-compatible users, sessions, accounts, and verifications.

Functional baseline:

* Email/password login is implemented with mock validation and mock session state.
* SSO/OAuth and password recovery appear as disabled future placeholders only if they do not imply implementation scope.
* Successful login routes admin users to the knowledge-base workspace by default, with admin pages available in navigation.
* Successful login routes member users to the knowledge-base workspace or chat page depending on the last intended route; default fallback is the knowledge-base workspace.
* Unauthenticated access to protected pages redirects to `/login?redirectTo=<internal-path>` in frontend-only routing.
* Authenticated users without admin permissions see no admin navigation and receive a restricted-access screen on direct admin URL access in the frontend MVP. Real API rejection remains later backend work.

Page states:

* Login form: email, password, submit, disabled/loading submit state, validation messages, and sanitized auth error.
* Route/form loading: skeleton fallback preserves the centered form frame; submit loading disables fields and shows progress without shifting layout.
* Session expired: show a restrained notice above the form and keep the intended route.
* Unauthorized: standalone protected-page state with "返回工作台" and "进入问答" actions.
* Already authenticated login access: redirect to intended route or knowledge-base workspace.
* Provide a visible way in development/mock UI to switch between `admin` and `member` roles for permission-state verification.

Out of login scope:

* Account self-registration.
* Full password reset email flow.
* MFA enrollment.
* SSO/OAuth provider setup.

### Document And Source Deep Pages (Confirmed)

Goal: provide the detailed document/source inspection surface that links knowledge-base management, ingestion processing, logs, and chat citations.

Entry points:

* Knowledge-base workspace document summary.
* Task queue status drawer.
* Document processing logs drawer.
* Chat Q&A citation card.

Document detail page:

* Shows document title, knowledge base, status, source type, current version, created by, created/updated timestamps, and processing summary.
* Shows source summary for file or URL source.
* Shows recent ingestion jobs and recent processing logs as compact summaries.
* Provides links to full task queue and document processing logs with filters pre-applied.
* Admin users see processing/log/admin actions. Members see authorized document/source content and task-status links, but not admin-only processing/log mutation actions.

Source preview:

* File sources show file metadata such as MIME type, size, object key placeholder, source hash summary, and processing status.
* URL sources show original URL, fetched title/summary when available, source hash summary, and crawl/fetch timestamp placeholder.
* Raw file rendering and full webpage rendering are deferred.

Chunk/fragment view:

* List chunks with chunk index, token estimate, source locator, content summary, and metadata indicator.
* Selecting a chunk opens a right-side drawer with full chunk content, source locator, token estimate, content hash summary, and sanitized metadata.
* Chunk list supports search within chunk summaries/content and filters by source locator when available.

Citation return behavior:

* Chat citation cards link to the document detail page and highlight/select the related chunk or source summary using URL state.
* Precise PDF page positioning or webpage scroll anchoring is deferred.

Processing log integration:

* Document detail shows recent log snippets only.
* Full log inspection happens on the document processing logs page with document/job filters pre-applied.

States:

* Loading: document header and chunk list skeleton.
* Route fallback: document detail route uses skeleton header, source preview, chunk list, and right drawer placeholders.
* Empty chunks: document exists but no chunks are available yet, with processing status shown.
* Failed document: show failure summary and link to task/log detail.
* No permission: show a restrained no-access state and return actions.

## Out of Scope (Explicit)

* Adding a new frontend framework or component library.
* Adding i18n.
* Implementing real backend authentication, API integration, streaming chat transport, provider calls, queue calls, database persistence, or live ingestion processing unless explicitly added to this task.
* Designing custom role management; Production v1 only has fixed `admin` and `member` roles.
* Building advanced chat citation review features such as answer text to citation highlight linking, per-citation feedback, copy citation actions, or original document deep-link positioning in this design pass.
* Adding custom roles or role management pages; user management only supports fixed `admin` and `member` roles.
* Displaying plaintext secrets, raw encrypted payloads, raw provider errors, or unsanitized audit metadata.
* Designing full enterprise SSO, OAuth provider setup, password reset email flows, MFA setup, or account registration in this pass unless explicitly added later.
* Rendering full raw PDF/webpage previews or implementing precise source-file deep positioning in this pass.
* Guaranteeing production-grade data persistence across browser refreshes. Temporary `localStorage` persistence is required only for this frontend MVP review and does not imply backend/database durability, multi-device sync, or migration support.

## Explicitly Not Acceptable

* Navigation destinations that land on placeholder-only pages or 404 routes.
* Visible buttons that do nothing and are not disabled with an accessible reason.
* Static preview cards used as substitutes for required functional pages.
* Plain text-only route loading states where a skeleton fallback is expected.
* Loading spinners used alone for large content regions such as tables, chat transcripts, details, or drawers. Spinners may supplement skeletons for small button-level pending states.
* Desktop-only layouts that overflow, clip controls, or become unreadable on tablet/mobile.
* Mock forms that submit without validation or without updating visible state when the user expects a result.

## Technical Notes

* Relevant frontend specs:
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/copywriting.md`
  * `.trellis/spec/frontend/lists.md`
  * `.trellis/spec/frontend/quality-guidelines.md`
* Existing product design source: `docs/superpowers/specs/2026-05-12-knowledge-base-ai-assistant-design.md`.
* Web files inspected during planning/first implementation pass:
  * `src/apps/web/src/app/page.tsx`
  * `src/apps/web/src/app/layout.tsx`
  * `src/apps/web/src/app/globals.css`
  * `src/apps/web/src/copy/bootstrap.ts` (removed by the first implementation pass)
  * `src/apps/web/src/copy/workspace.ts`
  * `src/apps/web/src/features/workspace/*`
  * `src/apps/web/package.json`
* 2026-05-15: Current first implementation pass added only the workspace page and static preview panels. User clarified this is insufficient; PRD now requires responsive full functional pages with real frontend interactions and working route navigation.
* 2026-05-15: User asked whether component fallback has skeletons. Current implementation does not; PRD now requires route-level and component-level skeleton fallbacks.
* Existing Playwright test: `e2e/bootstrap.spec.ts`.
* Visual companion session used for layout/style decisions: `.superpowers/brainstorm/49852-1778825262/`.
* Visual companion session used for Chat Q&A layout decisions: `.superpowers/brainstorm/55161-1778826086/`.
* Visual companion session used for admin/operations layout decisions: `.superpowers/brainstorm/58979-1778826621/`.
* Admin/operations field model checked against:
  * `src/packages/db/src/schema/auth.ts`
  * `src/packages/db/src/schema/ingestion.ts`
  * `src/packages/db/src/schema/provider.ts`
  * `src/packages/db/src/schema/audit.ts`
  * `src/packages/db/src/schema/knowledge.ts`
* 2026-05-15: User later approved entering implementation; Trellis task is now `in_progress`. Current code remains incomplete against the revised PRD.

## Decisions

* 2026-05-15: Earlier planning prioritized the knowledge-base workspace first. This is no longer sufficient as the final deliverable; it remains one page group inside the broader functional MVP.
* 2026-05-15: Earlier planning accepted a clickable static Next.js prototype with mock state. This decision is superseded by the user's later clarification requiring complete functional pages, working navigation, responsive behavior, and non-inert controls.
* 2026-05-15: Workspace information architecture is the three-column desktop layout: global navigation + knowledge base list + detail/action panel. It must collapse into a usable single-column mobile workflow.
* 2026-05-15: Visual direction is restrained operational UI: light surfaces, muted borders, teal primary color, and scan-friendly density.
* 2026-05-15: Earlier MVP scope limited implementation to the core knowledge-base flow and represented adjacent features as extension points. This decision is superseded; adjacent page groups must now be implemented as functional frontend pages with mock/local state.
* 2026-05-15: After confirming the knowledge-base workspace design, user asked to continue designing uncovered functional pages and selected chat Q&A first.
* 2026-05-15: Chat Q&A information architecture is fixed citation side panel: session list + central transcript/composer + right citation/feedback panel.
* 2026-05-15: Chat Q&A state coverage includes empty, retrieving, generating, completed with citations, completed without citations, and failed retry states.
* 2026-05-15: Chat Q&A citation/feedback depth is citation detail cards plus answer-level useful/not useful feedback with optional reason entry.
* 2026-05-15: User confirmed the Chat Q&A design.
* 2026-05-15: User continued to the recommended admin/operations page group after Chat Q&A.
* 2026-05-15: Admin/operations page group uses the recommended list/table plus right-side detail drawer model.
* 2026-05-15: Admin/operations design depth is full per-page interaction detail, including batch/row actions, confirmations, states, and permission differences.
* 2026-05-15: User confirmed admin/operations page group and continued to login/entry pages.
* 2026-05-15: User confirmed login/entry page direction.
* 2026-05-15: User confirmed document/source deep page direction.
* 2026-05-15: User clarified the expected deliverable is not a static/clickable sketch. The accepted scope is now a responsive multi-page functional frontend MVP: complete functional pages, interactive buttons, working navigation, mock/local-state behavior, and no inert controls.
* 2026-05-15: The current workspace-only implementation is considered incomplete against the revised PRD and must be expanded or reworked before final acceptance.
* 2026-05-15: Skeleton fallback is mandatory for route-level and component-level loading boundaries. Plain loading text or spinner-only large content loading is not acceptable.
* 2026-05-15: User clarified that frontend mock business data should temporarily persist in `localStorage` with the mock session/store, not remain purely in page-local memory.
* 2026-05-15: Route ambiguity is resolved: `/workspace` is the canonical workspace route and `/` redirects to `/workspace`.
* 2026-05-15: Skeletons must exist and match the final layout shape, but automated tests do not need to reliably freeze every transient route-level loading frame.
* 2026-05-15: User approved adding minimal executable constraints for the mock store: fixed localStorage key/version, deterministic seed reset, parse/version recovery, route access matrix, finite mock enum values, and representative P2 automated test depth.
