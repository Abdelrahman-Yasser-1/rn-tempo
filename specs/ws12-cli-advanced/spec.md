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
