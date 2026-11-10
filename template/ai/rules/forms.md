---
description: Build forms with the dynamic-forms FormBuilder when that module is on; hand-written react-hook-form forms otherwise.
globs: src/features/**,src/app/**
---

# Forms

- **Module on (`src/features/dynamic-forms` exists):** build a form with `FormBuilder` or `MultiStepFormBuilder` from `@features/dynamic-forms`: a typed `fields` or `steps` config and a Zod schema, not a hand-written `useForm` screen. Open a flow from a screen with `navigate('DynamicFormFlow', { flowId })` after listing it in `utils/flows.ts`.
- **Module off:** write the form by hand with react-hook-form, a Zod schema, and the `Form*` components from `@shared/components`.
- Do not add input components for the builder. A new field type is one entry in `FieldTypeMap` (`components/FieldRegistry/types.ts`) and one renderer in `components/FieldRegistry/FieldRegistry.tsx`, both mapping an existing `Form*` component.
- Labels are keys of the `forms` namespace (declare them with `// t('key', { ns: 'forms' })` hints) or `{ en, ar }` objects. Validation messages are `forms:validation.*` keys from `VALIDATION_MESSAGES`.
- Server-driven forms go through `fromJson`. The document is untrusted: never evaluate it, never compile a string from it into a regex (use the named patterns in `utils/patterns.ts`), never log its values. Functions (`calculatedValue`, `asyncValidate`, `custom`) exist only in code configs.
- Mark `sensitive: true` on any field that must not be saved in a draft or shown in the review (OTP and secure text are sensitive by default). File fields are never saved. Drafts are bound to the signed-in user, expire after 7 days and are cleared on sign-out.

```tsx
// ✅ module on
<FormBuilder<Values> fields={fields} schema={schema} onSubmit={save} draft={{ key: 'profile' }} />;

// ❌ module on: a hand-written useForm screen for a long form
const form = useForm<Values>({ resolver: zodResolver(schema) });
```
