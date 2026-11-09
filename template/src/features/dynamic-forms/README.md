# Dynamic forms

## Purpose

Config-driven forms: describe a form as typed data and the module renders it with the `Form*` inputs, validates it with Zod, and adds visibility rules, calculated values, async validation, steps, repeat sections, drafts and a review. The same engine also runs forms described by server JSON. Optional module `dynamic-forms`.

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `FormBuilder`: Single-page form rendered from a `fields` config and a Zod schema.
- `MultiStepFormBuilder`: Wizard with per-step validation, hidden steps, `canGoBack` and a step indicator.
- `createFormResolver`: The resolver the builders use; pass it to your own `useForm` with an external `form`.
- `VALIDATION_MESSAGES`: `forms:validation.*` message keys for your own Zod schemas.
- `FormBuilderProps`: Props of `FormBuilder`.
- `FormBuilderRef`: The `useForm` API plus `submit`.
- `MultiStepFormBuilderProps`: Props of `MultiStepFormBuilder`.
- `MultiStepFormBuilderRef`: The `useForm` API plus step navigation.
- `NavigationProps`: What `renderNavigation` receives.
- `StepConfig`: One step: fields, title, `visibleIf`, `canGoBack` and enter and leave hooks.
- `FormResolverOptions`: Options of `createFormResolver`.
- `BaseBuilderProps`: Props both builders share.
- `ReValidationMode`: When react-hook-form re-validates.
- `FieldTypeMap`: Field type to its config; the project edits it with the registry.
- `FieldTypeName`: Name of a field type.
- `BoundFormField`: A field bound to a value, one member per field type.
- `CustomFieldConfig`: Decorative content outside the form state.
- `FieldBehaviors`: `calculatedValue`, `clearOnHidden`, `resetOnChange`, `transform`, `asyncValidate` and friends.
- `FieldTexts`: Label, placeholder, helper text, sub label and tooltip of a field.
- `FieldVisibility`: `visibleIf` and `disabledIf`.
- `FormChangeEvent`: What `onChange` receives.
- `FormField`: One entry of a `fields` array.
- `FormOption`: Option of a select, multi select or radio group.
- `FormText`: A `forms` key, `ns:key` or an `{ en, ar }` object.
- `GroupFieldConfig`: Children stacked in a container.
- `LocalizedText`: An `{ en, ar }` text object.
- `RepeatFieldConfig`: A list of items the user adds and removes, between `minItems` and `maxItems`.
- `RepeatItemField`: A field inside a repeat item.
- `RowFieldConfig`: Children side by side.
- `StepDirection`: `next` or `back`.
- `ValidationMode`: When react-hook-form validates.

## Screens and routes

None yet.

## Data

No server data. Strings are in `src/locales/{en,ar}/forms.json`; validation messages are `forms:validation.*`.

## Spec

[`specs/dynamic-forms/spec.md`](../../../specs/dynamic-forms/spec.md), with its [design](../../../specs/dynamic-forms/design.md) and [tasks](../../../specs/dynamic-forms/tasks.md).
