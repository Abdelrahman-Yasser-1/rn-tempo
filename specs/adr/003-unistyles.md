# ADR-003: Unistyles 3 for styling and theming

- **Status:** accepted · 2026-10-24

## Context
We need themes (light/dark), breakpoints, RTL and variants, without re-rendering the tree on theme change.

## Decision
Use Unistyles 3. Its StyleSheet-compatible API updates the C++ shadow tree directly. It requires the New Architecture (RN 0.88 default) and its Babel plugin with `root: 'src'`.

## Consequences
- Theme switches don't re-render React components.
- Familiar StyleSheet syntax.
- Requires `react-native-nitro-modules` and `react-native-edge-to-edge`.
- Every file under `src/` is processed by the plugin.

## Alternatives
- Custom ThemeContext: re-renders.
- NativeWind: class strings are hard to lint for structure.
- Restyle: slower to develop in.
