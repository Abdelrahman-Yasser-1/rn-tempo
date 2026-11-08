# src/shared/components

The feature-agnostic UI kit. Every screen and feature composes UI from here; raw `Text`, `Image`, `Button`, `TextInput` and Touchables are lint errors outside this folder.

## Layout

```
shared/components/
  index.ts           named exports of every component
  <PascalName>/
    <PascalName>.tsx
    <PascalName>.test.tsx
    <PascalName>.stories.tsx
    styles.ts        Unistyles, tokens only
    types.ts
    index.ts
    use<PascalName>.ts (+ test), optional
```

## Rules

- Props are `Readonly<Props>`; use `type`, never `interface`. Named exports, no default exports.
- Style with Unistyles theme tokens only: no color literals, magic numbers or inline styles. Use `start`/`end`, not `left`/`right`.
- Accessibility is part of the component: role, label, state, 44x44 touch target, a `testID` that follows the convention.
- A component has no knowledge of any feature, store or API; data comes in through props.
- Every component ships a test (render, interaction, states, a11y role) and a story. Test with `getByRole`.
- Check it on iOS and Android, light and dark, `en` and `ar` (RTL).
- Android: a custom font with a non-400 `fontWeight` clips text. `@gorhom/bottom-sheet` modals need `accessible={false}`.
- Add the export to `index.ts` in the same commit.

## Generators

- `yarn tempo g component <Name>` creates the folder with test, story, styles, types and barrel.
- `yarn tempo g hook <name>` for a component's `use<Name>.ts`.

Full rules: `ai/rules/architecture.md`, `ai/rules/styling.md`, `ai/rules/a11y.md`.
