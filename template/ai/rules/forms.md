---
description: Build forms with the dynamic-forms FormBuilder when that module is on; hand-written react-hook-form forms otherwise.
globs: src/features/**,src/app/**,src/shared/components/DynamicForm/**
---

# Forms

- **Module on (`src/shared/components/DynamicForm` exists):** build a form with `FormBuilder` or `MultiStepFormBuilder` from `@shared/components/DynamicForm`: a typed `fields` or `steps` config and a Zod schema, not a hand-written `useForm` screen. Open a flow from a screen with `navigate('DynamicFormFlow', { flowId })` after listing it in `shared/components/DynamicForm/flows/flows.ts`.
- **Module off:** write the form by hand with react-hook-form, a Zod schema, and the `Form*` components from `@shared/components`.
- Do not add input components for the builder. A new field type is its name in `FieldTypeShape` (`DynamicForm/types.ts`), one entry in `FieldTypeMap` (`DynamicForm/components/FieldRegistry/types.ts`) and one renderer in `DynamicForm/components/FieldRegistry/FieldRegistry.tsx`, mapping an existing `Form*` component.
- Labels are `ns:key` strings (declare them with `// t('key', { ns })` hints) or `{ en, ar }` objects. Validation messages are `validation:formBuilder.*` keys from `VALIDATION_MESSAGES` (`@shared/components/DynamicForm`).
- Server-driven forms go through `fromJson`. The document is untrusted: never evaluate it, never compile a string from it into a regex (use the named patterns in `DynamicForm/utils/patterns.ts`), never log its values. Functions (`calculatedValue`, `asyncValidate`, `custom`) exist only in code configs.
- Mark `sensitive: true` on any field that must not be saved in a draft or shown in the review (OTP and secure text are sensitive by default). File fields are never saved. Drafts (`DynamicForm/drafts`) are bound to the signed-in user, expire after 7 days and are cleared on sign-out; the app wires them to the auth store in `App.tsx`, and the module never imports a feature.

```tsx
// ✅ module on
<FormBuilder<Values> fields={fields} schema={schema} onSubmit={save} draft={{ key: 'profile' }} />;

// ❌ module on: a hand-written useForm screen for a long form
const form = useForm<Values>({ resolver: zodResolver(schema) });
```
