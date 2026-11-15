# Dynamic forms — design

Spec: [`spec.md`](spec.md) · ADR-015 in the template docs.

## Placement

One component module, `src/shared/components/DynamicForm` (`shared-ui`): `components/` (`FormBuilder`, `MultiStepFormBuilder`, `FormFlow`, `FieldRenderer`, `BoundField`, `RepeatField`, `ReviewStep`, `FieldRegistry`), `hooks/`, `utils/` (the pure logic), `drafts/`, `flows/` (registry and demo flows), `screens/DynamicFormFlowScreen/`, `types.ts`, `constants.ts` and `index.ts`. Outside code imports `@shared/components/DynamicForm` only.

- `drafts` takes the auth state through `initDraftCleanup(source)`; `app/bootstrap/initFormDrafts.ts` passes the auth store, so the module imports no feature.
- The folder cannot import navigation, so the screen takes its route params from `DynamicFormFlowParams`.
- `types.ts` is the pure model: `FieldTypeShape` types `props` as `unknown`, and `components/FieldRegistry` instantiates the same config types with the typed `Form*` props.

## Screens and navigation

`DynamicFormFlow: { flowId: string }` in the root stack, registered in the `dynamic-forms` markers. Two demo flows (`demo-code`, `demo-json`) open from the non-prod Debug menu.

## Data

No API. Draft storage: MMKV `forms.draft.<key>`, JSON `{ v, step, values }`, encrypted with the app key. Sensitive fields and file fields are removed before saving.

## State

react-hook-form owns the values. The builder keeps the current step in React state. Behavior state (previous values, timers, async errors) lives in refs inside the builder.

## Validation

A Zod schema (code) or one built from declarative rules (JSON). A resolver wrapper drops errors of hidden fields and merges the async errors, so both paths behave the same.

## i18n

No namespace of its own. Labels are `ns:key` strings or `{ en, ar }` objects. Builder labels are in `common:formBuilder.*`, validation messages in `validation:formBuilder.*` (translated by the existing `Form*` components), and the demo flow and Debug menu strings in `app:formsDemo.*` and `app:debug.forms.*`.

## a11y

Inputs come from the `Form*` components. Repeat add and remove buttons have labels with the item number. The step indicator announces "Step n of m".

## Risks

- Server JSON is untrusted: strict schema, caps, no code evaluation, safe patterns only.
- A draft holds personal data: it is encrypted, never holds sensitive or file fields, and `discardDraft` is exported for sign-out.
