---
name: add-screen
description: Add a screen to a feature and register its route. Use when the user asks for a new screen or page.
---

# add-screen

1. Read `ai/rules/architecture.md`, `styling.md`, `i18n.md` and `a11y.md`.
2. Run `yarn tempo g screen <Name> --feature <feature> [--stack <Stack>]` (when the CLI is installed). It creates `screens/<Name>Screen/{<Name>Screen.tsx,<Name>Screen.test.tsx,styles.ts,index.ts}` and appends the route to `src/navigation/types.ts`. Without the CLI, create these four files by hand.
3. Build the UI from `@shared/components` only (`Screen`, `Text`, `Box`, `Button`, ...). Root `testID` is `<screen-kebab>-screen`; elements are `<screen-kebab>.<element-kebab>`.
4. Add every string to the feature's `en` and `ar` locale files and use `t()`.
5. Register the route in the navigator and, if it is deep-linkable, in `linking.ts`.
6. Handle loading, empty and error states (`Loader`, `EmptyState`, `ErrorState`).
7. Write the screen test with `renderWithProviders` (see `write-tests`).
8. Run `yarn verify:changed`. Commit: `feat(<feature>): add <name> screen`.
