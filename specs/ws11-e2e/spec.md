---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS11 — E2E with Maestro (Wave 2; after WS9)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/e2e/**`.

## Acceptance criteria
- **AC-1** all flows pass locally on the Android emulator (devRelease, mocks on); the iOS simulator run is documented.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS11 — E2E with Maestro (Wave 2; after WS9)
**Owns:** `template/e2e/**`.
- **Files:** `e2e/config.yaml`, `e2e/flows/{auth-login,auth-logout,items-browse,profile-edit,settings-language-rtl,deeplink-settings}.yaml`, `e2e/subflows/{login,launch-clean}.yaml`, `e2e/README.md`.
- Use `appId: ${APP_ID}` with a default `com.rntempo.app.dev`. Use only the §C14 testIDs. Tag flows with the AC IDs (`tags: [AC-1]`).
- Script: `"e2e": "maestro test e2e/flows"`.
- **Done when:** all flows pass locally on the Android emulator (devRelease, mocks on); the iOS simulator run is documented.
- **Commits:** one per 2 flows.

---
