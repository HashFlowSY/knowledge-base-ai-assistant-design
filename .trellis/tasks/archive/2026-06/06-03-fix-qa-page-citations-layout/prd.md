# Fix QA page citation layout and navigation

## Goal

Improve the chat QA page readability and citation verification interaction. Message bubbles, citation verification entries, and feedback controls should have clear vertical separation, and clicking a citation in an answer should reveal the matching citation in the verification panel.

## What I already know

* The user reported three issues on the QA page:
  * QA content is visually too tight.
  * Citation verification paragraphs/documents are visually too tight.
  * Clicking an answer citation updates selection but does not jump the verification panel to the corresponding paragraph.
* The affected frontend is under `src/apps/web/src/features/chat`.
* `ChatPage` stores the selected citation in the URL as `citationId`.
* `MessageBubble` calls `onSelectCitation(citation.id)` when an inline answer citation is clicked.
* `CitationPanel` renders all answer citations and highlights the active citation through `cardActionButtonClassName`.
* `ScrollArea` wraps children inside a Radix viewport. Current `space-y-4` classes on `ScrollArea` root do not reliably apply spacing to the actual viewport content children.

## Assumptions

* This task should keep the existing three-column chat layout and shadcn/Radix `ScrollArea` wrapper.
* The fix should be frontend-only unless code inspection proves backend data is missing.
* Citation click behavior should keep URL state (`citationId`) and add visible scroll/focus behavior rather than replacing the existing state model.
* The verification panel should scroll the citation card into view when `activeCitation` changes, including changes caused by clicking answer citation buttons.

## Requirements

* Add reliable vertical spacing between chat messages inside the conversation scroll viewport.
* Add reliable vertical spacing between citation verification cards and feedback form inside the citation panel viewport.
* Keep message text and citation snippet text readable with existing `leading-6` behavior.
* Clicking a citation button inside an assistant answer must:
  * update the active citation URL state as it does today;
  * highlight the matching verification card;
  * scroll the matching verification card into view in the right-side citation panel.
* The scroll behavior must be scoped to the citation panel and must not disturb the main conversation scroll position.
* Use semantic buttons for citation selection and keep keyboard accessibility intact.

## Acceptance Criteria

* [ ] Chat messages have visible gaps between adjacent question/answer bubbles in the actual rendered scroll content.
* [ ] Citation verification cards have visible gaps between adjacent citations and are not visually glued to the feedback form.
* [ ] Clicking an answer citation reveals the matching verification card in the citation panel.
* [ ] The active citation card remains visually distinguishable.
* [ ] Existing chat page tests are updated or extended to cover the layout helper and citation navigation contracts.
* [ ] Frontend lint, typecheck, and targeted tests pass.

## Definition of Done

* Requirements above are implemented.
* Tests are added or updated for the behavior/contract changed.
* `pnpm --filter @kb/web test`, `pnpm --filter @kb/web typecheck`, and `pnpm --filter @kb/web lint` pass or any blocker is documented.
* No backend API, database, or RAG contract changes are introduced unless separately justified.

## Out of Scope

* Redesigning the overall chat page layout.
* Changing citation generation, ranking, or backend retrieval behavior.
* Adding document preview pages or deep links to source files.
* Reworking feedback persistence.

## Technical Notes

* Relevant files inspected:
  * `src/apps/web/src/features/chat/chat-page.tsx`
  * `src/apps/web/src/features/chat/chat-panels.tsx`
  * `src/apps/web/src/features/chat/chat-layout.ts`
  * `src/apps/web/src/features/chat/chat-layout.test.ts`
  * `src/apps/web/src/features/chat/chat-panels.test.ts`
  * `src/apps/web/src/components/ui/scroll-area.tsx`
  * `src/apps/web/src/lib/action-styles.ts`
* Relevant frontend specs:
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/guides/index.md`
