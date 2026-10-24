---
status: approved
owner: integrator (Claude Opus)
created: 2026-10-24
plan: ../PLAN.md
---

# WS14 — Integration & release (Wave 3; integrator)

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

### WS14 — Integration & release (Wave 3; integrator)
1. **Template matrix CI** (root `.github/workflows/template.yml`):
   - (a) template as-is: `yarn verify`, Android `assembleDevDebug`, iOS `TempoApp-Dev` simulator build
   - (b) "minimal": run `create-tempo-app Minimal --template ./template --yes --features none` → verify + Android build
   - (c) "defaults": the same with the default features
   - (d) generated `tempo g feature wallet --register` → verify
2. **Contracts:** every manifest's `deleteGlobs` resolves to existing files; every marker is balanced (a CLI script runs in CI).
3. **Docs:** the region-include build passes; the `llms.txt` route returns content.
4. **Publishing:** changesets publish `@rn-tempo/*` and `create-tempo-app` with the `next` tag. Tag the template as `v1.0.0-rc.1`.
5. **Dry run:** create a project on a clean machine, run each env on both platforms, run an AI agent `/spec` → `/plan` → `/implement` for a small "favorites" feature, and confirm the session logs, trailers, PR AI report, Danger and spec-check.
6. **Release:** fix findings → `v1.0.0` → pilot on a real project.

---
