---
name: add-component
description: Add a shared or feature component with styles, tests and a story. Use when the user asks for a new UI component.
---

# add-component

1. Decide the home: reusable and feature-agnostic goes in `src/shared/components/<Name>/`; otherwise `src/features/<f>/components/<Name>/`.
2. Run `yarn tempo g component <Name> [--feature <f>]` (when the CLI is installed). Without it, create the folder by hand. Shared components need `<Name>.tsx`, `<Name>.test.tsx`, `<Name>.stories.tsx`, `styles.ts`, `types.ts`, `index.ts`; add the export to `src/shared/components/index.ts`.
3. Props: exported from `types.ts`, `Readonly<Props>`, a `type` alias, and a `testID` that is passed down (`${testID}.label`).
4. Style with Unistyles tokens and `variants` for size and appearance (see `ai/rules/styling.md`). RTL-safe, no literals.
5. Accessibility: role, label, state, 44x44 target, reduced motion (see `ai/rules/a11y.md`).
6. A story that covers every variant and state; a test for render, interaction and a11y.
7. Add a one-line JSDoc to exported functions and components in `shared/`.
8. Run `yarn verify:changed`. Commit: `feat(ui): add <name> component`.
