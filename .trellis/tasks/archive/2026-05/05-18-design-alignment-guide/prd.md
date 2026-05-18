# Add Pre-Implementation Design Alignment Guide

## Goal

Add a lightweight pre-implementation guide rule so backend work that connects to existing frontend pages first checks relevant frontend, backend, and database design slices for drift before coding.

## What I Already Know

- `.trellis/spec/guides/cross-layer-thinking-guide.md` already covers cross-layer data flow, contract owners, required IDs, and pre/post implementation checklists.
- `.trellis/spec/guides/index.md` already points agents to the cross-layer guide when a feature touches 3+ layers.
- The current guide does not explicitly require product/design alignment across latest frontend PRDs, frontend mock contracts, backend specs, and database schema before implementation starts.
- The user wants this rule to stay lightweight and avoid consuming most of a session context.

## Requirements

- Update the guides without changing application runtime code.
- Add a concise design-alignment step to the cross-layer guide.
- Make clear that agents should inspect only relevant slices, not bulk-load all PRDs or schema files.
- Require a short task note that records current frontend contract, backend/database assumptions, mismatches or deprecated concepts, and decisions needed before coding.
- Update the guides index so backend work for an existing frontend page/workflow triggers the cross-layer guide.

## Acceptance Criteria

- [x] `.trellis/spec/guides/index.md` includes the new trigger.
- [x] `.trellis/spec/guides/cross-layer-thinking-guide.md` includes a lightweight design alignment section before implementation.
- [x] The new wording explicitly avoids full-document bulk loading and points to relevant slices.
- [x] No application code is changed.

## Out of Scope

- Adding a new guide file.
- Updating backend/frontend/database specs beyond the shared thinking guide.
- Running app build/test suites for this docs-only change.

## Technical Notes

- Relevant files:
  - `.trellis/spec/guides/index.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
