# Dynamic forms — design

Spec: [`spec.md`](spec.md) · ADR-015 in the template docs.

## Screens and navigation

`DynamicFormFlow: { flowId: string }` in the root stack, registered in the `dynamic-forms` markers. Two demo flows (`demo-code`, `demo-json`) open from the non-prod Debug menu.

## Data

No API. Draft storage: MMKV `forms.draft.<key>`, JSON `{ v, step, values }`, encrypted with the app key. Sensitive fields and file fields are removed before saving.

## State

react-hook-form owns the values. The builder keeps the current step in React state. Behavior state (previous values, timers, async errors) lives in refs inside the builder.

## Validation

A Zod schema (code) or one built from declarative rules (JSON). A resolver wrapper drops errors of hidden fields and merges the async errors, so both paths behave the same.

## i18n

Namespace `forms`. Labels are keys (`key` or `ns:key`) or `{ en, ar }` objects. Validation messages are `forms:validation.*` keys, translated by the existing `Form*` components.

## a11y

Inputs come from the `Form*` components. Repeat add and remove buttons have labels with the item number. The step indicator announces "Step n of m".

## Risks

- Server JSON is untrusted: strict schema, caps, no code evaluation, safe patterns only.
- A draft holds personal data: it is encrypted, never holds sensitive or file fields, and `discardDraft` is exported for sign-out.
