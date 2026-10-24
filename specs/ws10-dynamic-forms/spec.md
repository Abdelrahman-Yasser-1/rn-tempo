---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS10 — Dynamic forms module (Wave 2)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/src/features/dynamic-forms/**`, `specs/dynamic-forms/**`, `src/locales/*/forms.json` (add `forms` to the §C11 namespaces and the §C10.2 scope `forms`, which already exists).

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS10 — Dynamic forms module (Wave 2)
**Owns:** `template/src/features/dynamic-forms/**`, `specs/dynamic-forms/**`, `src/locales/*/forms.json` (add `forms` to the §C11 namespaces and the §C10.2 scope `forms`, which already exists).
- **Port ejada's `config-driven-forms`** (read every file under `src/features/config-driven-forms`) to:
  - Zod 4
  - Unistyles 3
  - WS4 components
  - i18n keys (not literals)
  - the §C5 structure: `components/FieldRenderer`, `components/StepForm`, `components/sections/*`, `configs/flows/<flow>/steps/NN.step.ts`, `validation/buildValidationSchema.ts`, `validation/createFormResolver.ts`
- **Keep:** the field registry pattern, visibility conditions, repeatable sections, and per-step validation.
- **Route:** `DynamicFormFlow: { flowId: string }`, registered only inside the `dynamic-forms` markers.
- The whole folder sits in markers, with `defaultEnabled: false` in the manifest.
- **AC:** each field type renders; visibility rules; repeatable add/remove; step validation blocks Next; submit produces typed output.

---
