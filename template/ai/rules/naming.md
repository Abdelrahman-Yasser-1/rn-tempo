---
description: File, folder, identifier and boolean naming rules enforced by ls-lint and ESLint.
globs: src/**
---

# Naming

Names are enforced by `ls-lint` (files, folders) and `@typescript-eslint/naming-convention` (identifiers). `yarn lint:files` checks the file names.

| Thing                        | Rule                                                   | Example                       |
| ---------------------------- | ------------------------------------------------------ | ----------------------------- |
| Directories                  | kebab-case                                             | `src/features/user-settings/` |
| Component and screen folders | PascalCase                                             | `LoginScreen/`, `Button/`     |
| `.tsx` files                 | PascalCase                                             | `LoginScreen.tsx`             |
| `.ts` files                  | camelCase                                              | `formatDate.ts`               |
| Hooks                        | `useX.ts`                                              | `useDebounce.ts`              |
| Stores                       | `x.store.ts`                                           | `auth.store.ts`               |
| API files                    | `x.api.ts`                                             | `items.api.ts`                |
| Type declarations            | `x.d.ts`                                               | `i18next.d.ts`                |
| Locale files                 | kebab-case `.json`                                     | `src/locales/en/common.json`  |
| Constants                    | `UPPER_CASE`                                           | `STORAGE_KEYS`                |
| Types, components            | PascalCase                                             | `ItemCardProps`               |
| Enums                        | **forbidden**: use `as const` objects plus union types |                               |

Type definitions use `type`, never `interface` (`consistent-type-definitions: type`).

## Booleans

Boolean variables and parameters start with one of: `is`, `has`, `should`, `can`, `did`, `will`, `show`, `hide`, `was`, `could`, `needs`, `allows`, `wants`, `requires`. `UPPER_CASE` constants are exempt.

```ts
// ✅
const isLoading = true;
const hasError = false;

// ❌
const loading = true;
const error = false; // when it is a boolean
```

## No enums

```ts
// ✅
export const ITEM_STATUS = { active: 'active', archived: 'archived' } as const;
export type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS];

// ❌
enum ItemStatus {
  Active,
  Archived,
}
```

## Other

- Always `import type` / inline `type` for type-only imports (`consistent-type-imports`).
- `eqeqeq` and `curly: all`: always use `===` and braces.
- Test files sit next to their subject: `Button.test.tsx`, `useDebounce.test.ts`, `auth.store.test.ts`.
