---
status: implemented
owner: rn-tempo
created: 2026-11-09
---

# Dynamic forms

## Problem

Apps with many forms repeat the same work: lay out fields, show or hide them by rules, validate per step, keep a draft, show a review. The `Form*` inputs exist, but nothing turns a description of a form into a screen, or lets a server describe a form safely.

## User stories

- As a developer, I want to describe a form as typed data, so that I do not hand-write a react-hook-form screen for each one.
- As a developer, I want multi-step forms with per-step validation, a draft and a review, so that long flows are cheap to build.
- As a developer, I want the server to define a form as JSON, so that a form can change without an app release.
- As a user, I want to resume a half-filled form and check my answers before I send them.

## Acceptance criteria

- **AC-1** Given a form config with every field type, when it renders, then each field renders through the registry and binds to form state.
- **AC-2** Given `visibleIf`, `disabledIf`, `clearOnHidden`, `resetOnChange`, `calculatedValue` and `transform`, when values change, then the fields react, and hidden fields are not validated.
- **AC-3** Given `asyncValidate` with a debounce, when the user types, then one call runs after the pause, its error shows, and a stale call never overwrites a newer result.
- **AC-4** Given a multi-step form, when Next is pressed with an invalid visible field, then the step does not change; Back skips hidden steps; a step with `canGoBack: false` has no way back.
- **AC-5** Given a repeat section with `minItems` and `maxItems`, when the user adds or removes items, then the limits hold and each item is validated.
- **AC-6** Given `draft: { key }`, when the form is remounted, then the values and the step are restored; on successful submit the draft is cleared; sensitive and file fields are never saved.
- **AC-7** Given `review: true`, when the last step is reached, then a summary lists the visible, non-sensitive values and Edit jumps to the step.
- **AC-8** Given a JSON document, when it is loaded, then unknown types, eval-like content and unsafe patterns are rejected, and the JSON and code versions of one form behave identically.
- **AC-9** Given valid values, when the form is submitted, then `onSubmit` receives them typed.
- **AC-10** Given the module is removed with the CLI, then no file refers to it and `yarn verify` passes.

## Out of scope

- New input components.
- Expression strings or any evaluation of server text.
- Fetching flows from an API.
- Nested repeat sections.

## Open questions

-
