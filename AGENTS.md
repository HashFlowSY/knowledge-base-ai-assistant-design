<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

# Sub Agent Restrictions

When using sub agents in this project, follow these rules:

1. The main agent owns workflow control.
   - Sub agents must not create, start, archive, or otherwise manage Trellis tasks.
   - Sub agents must not run `git commit`, create branches, or perform repository-wide cleanup.
   - Sub agents must not run broad auto-fix or formatting commands unless explicitly authorized.

2. Each sub agent must have one explicit responsibility.
   - Declare that it is a sub agent in the task prompt.
   - State the exact goal, allowed read scope, allowed write scope, and forbidden paths.
   - Keep the sub agent focused on that task only; it should finish and return results without waiting for unrelated work.

3. Sub agents must respect ownership boundaries.
   - A read-only research or explorer sub agent must not edit files.
   - A worker sub agent may edit only the files or directories explicitly assigned to it.
   - A review or check sub agent should report findings by default and only fix issues when explicitly asked.

4. Stop instead of guessing.
   - If the sub agent needs to edit files outside its allowed scope, it must stop and return the reason.
   - If the sub agent finds product, architecture, naming, or workflow decisions that were not specified, it must stop and return the decision needed.
   - If the sub agent detects possible conflicts with another agent or unexpected existing changes, it must stop and return the conflict reason.

5. Parallel work must be partitioned.
   - Multiple sub agents may read concurrently.
   - Multiple writing sub agents must have disjoint file or directory ownership.
   - Avoid assigning the same shared file, barrel export, config file, lockfile, or task metadata file to multiple sub agents at once.

6. Sub agent results must be concrete.
   - Report what was done.
   - List files changed.
   - List verification commands run and their results.
   - Report unresolved risks, skipped checks, and any decisions needed from the main agent or user.

In short: a sub agent may only perform a single clearly scoped task inside explicitly authorized boundaries. If it needs to cross a boundary, make a decision, or resolve a conflict, it must stop and return the reason.
