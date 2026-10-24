# @rn-tempo/eslint-config

Shared [ESLint](https://eslint.org) flat config for RN-TEMPO projects.

- TypeScript `strictTypeChecked` + `stylisticTypeChecked` (project service), naming conventions, no enums, no `console`
- React (`@eslint-react`, Rules of Hooks) and React Native (`react-native`, `react-native-a11y`, compat-wrapped for ESLint 10)
- Quality: sonarjs, a curated unicorn set, promise, regexp, jsdoc (services and shared), no-secrets, import-x (order, cycles, no default export), TanStack Query, i18next literal strings
- Tests: `jest` and `testing-library/react` for `*.test.ts(x)`
- Restrictions: `Text`/`StyleSheet`/... from `react-native`, `react-native-config`, async-storage, `axios`, MMKV and Keychain may only be imported from their owning module
- `structure: true`: import boundaries (`eslint-plugin-boundaries`) and the folder skeleton of contract C5 (`eslint-plugin-project-structure`)

## Usage

```js
// eslint.config.mjs
import { createConfig } from '@rn-tempo/eslint-config';

export default [
  { ignores: ['android', 'ios', 'vendor', 'coverage'] },
  ...createConfig({ root: import.meta.dirname, structure: true }),
];
```

`root` is the folder holding `tsconfig.json`. The config expects the C4 path aliases in that `tsconfig.json`.

The lint plugins are dependencies of this package, so a project only needs `eslint`, `typescript` and this package. In the template the package is linked with `link:` so the plugins resolve from the monorepo root.

## Tests

`yarn test` lints `test/fixtures/valid` (must be clean) and `test/fixtures/invalid` (each case must raise the expected rule).
