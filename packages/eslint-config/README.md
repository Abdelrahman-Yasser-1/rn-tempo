# @rn-tempo/eslint-config

Shared [ESLint](https://eslint.org) flat config for RN-TEMPO projects.

- TypeScript `strictTypeChecked` + `stylisticTypeChecked` (project service), naming conventions, no enums, no `console`
- React (`@eslint-react`, Rules of Hooks) and React Native (`react-native`, `react-native-a11y`, compat-wrapped for ESLint 10)
- Quality: sonarjs, a curated unicorn set, promise, regexp, jsdoc (services and shared), no-secrets, import-x (order, cycles, no default export), TanStack Query, i18next literal strings
- Tests: `jest` and `testing-library/react` for `*.test.ts(x)`
- Scoped restrictions: `rn-tempo/restricted-syntax` (error) and `rn-tempo/discouraged-syntax` (warn) take entries `{ selector, message, files?, ignores? }`, so entries never overwrite each other. They carry the enum ban, `react-native` component names and `StyleSheet`, `*.svg` and async-storage imports, logical style properties, `../` imports, `export *`, `process.env`, env-name branching, color literals, `Appearance`/`StatusBar`, template-literal and selector-form translation keys (use `t('a.b')`), `@test-utils/*` and the `getByTestId` warning
- Dependency ownership: `rn-tempo/dependency-owner` checks imports against `DEPENDENCY_POLICY` (`owned` by folders, `free`, or `native`); `*.svg` files are never imported, icons are drawn with `<Icon name=... />`
- Size guards on `src`: `max-lines` 300, `max-params` 4, `max-depth` 4, `arrow-body-style`, `@stylistic/jsx-self-closing-comp`
- Disable directives: description required, no unlimited disables, paired enables, unused disables are errors; `@eslint-react/no-array-index-key` is an error
- `structure: true`: import boundaries (`eslint-plugin-boundaries`) and the folder skeleton of contract C5 (`eslint-plugin-project-structure`)

## Usage

```js
// eslint.config.mjs
import { createConfig } from "@rn-tempo/eslint-config";

export default [
  { ignores: ["android", "ios", "vendor", "coverage"] },
  ...createConfig({ root: import.meta.dirname, structure: true }),
];
```

`root` is the folder holding `tsconfig.json`. The path aliases are read from its `compilerOptions.paths` (`import-x/internal-regex` is built from them).

## Options and exports

`createConfig({ root, structure, dependencies })`

- `structure`: also enable the import boundaries and the folder skeleton.
- `dependencies`: entries merged over `DEPENDENCY_POLICY`, for the project's own packages:

  ```js
  export const dependencies = {
    "some-sdk": {
      kind: "owned",
      owners: ["src/services/some/**"],
      message: "Use @services/some.",
    },
    "some-lib": { kind: "free", reason: "Used across the app." },
    "some-native": { kind: "native", reason: "Linked natively; no JS import." },
  };
  ```

  Export the same object from `eslint.config.mjs` so `yarn lint:deps` can report runtime dependencies without an entry. Keys may end with `*`.

Package exports: `createConfig`, `DEPENDENCY_POLICY`, `findPolicyEntry` and `rnTempoPlugin` (rules `restricted-syntax`, `discouraged-syntax`, `dependency-owner`, `one-component-per-file`). `max-lines-per-function`, `complexity` and `one-component-per-file` are not enabled yet (too many existing violations in the template).

The lint plugins are dependencies of this package, so a project only needs `eslint`, `typescript` and this package. In the template the package is linked with `link:` so the plugins resolve from the monorepo root.

## Tests

`yarn test` lints `test/fixtures/valid` (must be clean) and `test/fixtures/invalid` (each case must raise the expected rule). A coverage test fails when a rule set by an `rn-tempo/*` block, a syntax entry or an owned dependency has no failing fixture. `test/plugin.test.mjs` runs the plugin rules with `RuleTester` and checks that each restriction rule is set in at most one block.
