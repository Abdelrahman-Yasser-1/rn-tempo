---
status: implemented
owner: implementer, reviewed by the integrator
created: 2026-10-24
plan: ../PLAN.md
---

# WS10 — Dynamic forms module (Wave 2)

Optional module `dynamic-forms` (default off). Rewritten on 2026-11-09 after the owner's decisions: the core is the owner's FormBuilder design ported to Zod and the template, not a port of ejada's `config-driven-forms`. The template-side spec the generated app ships is `template/specs/dynamic-forms/` (the manifest deletes it with the module).

## Problem

Apps with many forms (onboarding, KYC, requests) repeat the same work: lay out fields, show or hide them by rules, validate per step, keep a draft, show a review. Hand-written react-hook-form screens do this well for one or two forms and badly for twenty. The template has the typed `Form*` inputs but nothing that turns a description of a form into a screen. Some projects also want the server to define the form, which needs a data format and safe handling of that data.

## Decisions (owner, fixed)

1. **Core = the owner's FormBuilder design** (a GoMoney component), ported to Zod 4 and the template: a single-page `FormBuilder` and a `MultiStepFormBuilder`, a typed discriminated `FormField<T>` union over a project `FieldTypeMap`, bound-field behaviors (`visibleIf`, `disabledIf`, `calculatedValue`, `defaultValue`, `clearOnHidden`, `resetOnChange`, `onValueChange`, `transform`, `asyncValidate` + `asyncValidateDebounceMs`, `validateOnChange`), layouts `row`, `group`, `custom`, the props and refs of the original.
2. **One registry file** maps each field type to a renderer. It maps to the existing `Form*` components; no new inputs. Each type's props are the component's props minus the controlled ones.
3. **JSON adapter** for server-driven forms: `FormSchemaJson` and `FlowJson`, converted to the typed config and to a Zod schema. Declarative conditions and rules only. The JSON is untrusted. Code-only features (functions) are not in the format.
4. **Repeatable sections** (`repeat`, via `useFieldArray`), in code and in JSON.
5. **Draft persistence**, opt in per form with `draft: { key }`, in encrypted MMKV. Sensitive and file fields are never saved.
6. **Review step**, opt in with `review: true` on a multi-step form, built from the field config with `FormReview`.
7. **Placement:** `src/features/dynamic-forms/`, everything in `dynamic-forms` markers outside the folder, other code imports only `@features/dynamic-forms`.
8. **Demo:** two flows reachable from the non-prod Debug menu, one from a code config, one from bundled JSON.

## Scope

Owns: `template/src/features/dynamic-forms/**`, `template/specs/dynamic-forms/**`, `src/locales/*/forms.json`, the marked regions in `STORAGE_KEYS`, route types, `App.tsx`, `RootNavigator`, the Debug menu and `resources.ts`, the docs page and ADR-015, and `ai/rules/forms.md`.

## Acceptance criteria

- **AC-1** Every field type renders through the registry and binds to form state.
- **AC-2** `visibleIf`, `disabledIf`, `clearOnHidden`, `resetOnChange`, `calculatedValue` and `transform` work, and hidden fields are not validated.
- **AC-3** Debounced async validation shows its error and cancels stale calls.
- **AC-4** In a multi-step form, Next is blocked by invalid visible fields, Back skips hidden steps, and `canGoBack: false` is respected.
- **AC-5** Repeat add and remove respect min and max items and validate per item.
- **AC-6** A draft is restored after a remount, cleared on submit, and never contains sensitive or file fields.
- **AC-7** The review step lists the visible, non-sensitive values, and Edit jumps to the step.
- **AC-8** JSON is validated: unknown types, eval-like content and unsafe patterns are rejected, and a JSON form and the code config of the same form behave identically.
- **AC-9** Submit produces typed output.
- **AC-10** The CLI removes the module cleanly and the app still passes `verify`.

## Out of scope

- New input components (the registry only maps existing `Form*` components).
- Expression strings, scripting or any evaluation of server text; functions in JSON.
- Fetching flows from an API (the demo bundles its JSON; a project fetches and passes the object to `fromJson`).
- Offline sync of drafts, drafts shared across devices, conflict resolution.
- Nested repeat sections, and conditions inside repeat items (v1).
- Anything owned by another workstream. Requests go in the PR under "Out-of-scope requests".

## Open questions

None. The choices the brief left open are recorded in ADR-015 and in the PR report.
