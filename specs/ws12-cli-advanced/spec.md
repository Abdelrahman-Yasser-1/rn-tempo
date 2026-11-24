---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS12 — CLI advanced (Wave 2; after WS5 + WS7.3)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** See plan section.

## Decisions (integrator, 2026-11-24)
- **Order:** WS12 runs after WS16 (amendment 56). One branch `ws12/cli-advanced`, one PR, one commit per command.
- **`tempo ai sync|report` and `tempo spec new|check`** run the project's own scripts (`scripts/ai-sync`, `scripts/ai-log/report.mjs`, `scripts/spec-check.mjs`, the spec templates), so a project keeps working with the scripts of its own template version. They fail with a clear `CliError` when the project has no such script.
- **`tempo upgrade`:**
  - The base is the template at the project's `templateVersion`; the target is the latest release, or `--to <version>`, or `--template <folder|source>` (for tests and forks), through `fetchTemplate`.
  - Both copies get the project's identity, envs and feature set from `.tempo.json`, with the same code `create` uses, so the diff holds only template changes.
  - Never in the patch: `node_modules`, `ios/Pods`, build outputs, `.env.*` (other than `.env.example`), `backend/.data/`, `.tempo/*.patch`, lockfiles are listed but not patched (the user reinstalls).
  - It writes `.tempo/upgrade-<from>-<to>.patch` and prints a summary (files added, changed, removed; conflicts expected) plus the docs upgrade-guide link. `--apply` runs `git apply --3way` and needs a clean git tree; on conflicts it leaves the conflict markers and says so. On success it updates `templateVersion` in `.tempo.json`.
- **`--json`:** every command prints exactly one JSON result on stdout through the shared reporter; logs go to stderr. The shapes are listed in the CLI docs.
- **`create-tempo-app`** runs the generated project's `ai sync` after install (the step the WS5 pipeline skipped until now).

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS12 — CLI advanced (Wave 2; after WS5 + WS7.3)
- `tempo ai sync|report` (wraps `syncAi` and `scripts/ai-log/report.mjs`)
- `tempo spec new <name>` (copies the templates) and `tempo spec check` (wraps `spec-check.mjs`)
- `tempo upgrade`:
  1. fetch the template at the project's `templateVersion` and at the latest
  2. apply the project's rename + feature removal to both
  3. produce a unified diff → write it to `.tempo/upgrade-<from>-<to>.patch`
  4. print a summary and the docs upgrade-guide link
  5. `--apply` runs `git apply --3way`
- `--json` output for every command; stable JSON shapes documented in the CLI docs.
- `create-tempo-app` calls `ai sync`.
- **Commits:** one per command.

---
