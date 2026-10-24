---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS1 — Config packages (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `packages/{eslint-config,prettier-config,tsconfig}`, `template/{eslint.config.mjs,prettier.config.mjs,.ls-lint.yml,knip.json,i18next.config.ts}`, and the lint scripts in `template/package.json`. (`package.json` edits are allowed in the `scripts` section only.)

## Acceptance criteria
- **AC-1** `yarn verify` passes on the skeleton, and putting a fixture violation into `src` makes it fail.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS1 — Config packages (Wave 1)
**Owns:** `packages/{eslint-config,prettier-config,tsconfig}`, `template/{eslint.config.mjs,prettier.config.mjs,.ls-lint.yml,knip.json,i18next.config.ts}`, and the lint scripts in `template/package.json`. (`package.json` edits are allowed in the `scripts` section only.)

**1.1 prettier-config**
- **Contents:** `{ singleQuote: true, trailingComma: 'all', printWidth: 100, semi: true, arrowParens: 'always', bracketSpacing: true }`.
- **Template:** `prettier.config.mjs` re-exports it.
- **Commit:** `feat(prettier-config): add shared prettier config`

**1.2 tsconfig package**
- **Contents:** `base.json` (strict + `noUncheckedIndexedAccess` + `noImplicitOverride` + `noFallthroughCasesInSwitch`), `react-native.json` (extends `@react-native/typescript-config` + base).
- **Template:** `tsconfig.json` extends `@rn-tempo/tsconfig/react-native.json` and keeps the paths.
- **Commit:** `feat(tsconfig): add shared tsconfig presets`

**1.3 eslint-config: base**
- **Exports:**
  - `index.mjs` exports `createConfig({ root, structure?: boolean })` returning a flat config array.
  - `configs/base.mjs`: typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, using `parserOptions.projectService: true`.
  - `configs/react.mjs`: `@eslint-react` recommended-typescript + react-hooks recommended.
  - `configs/react-native.mjs`:
    - `eslint-plugin-react-native` rules `no-unused-styles`, `no-inline-styles`, `no-color-literals`, `no-raw-text` (off when the i18n rule covers it), all compat-wrapped.
    - `react-native-a11y` (compat-wrapped) rules:
      - `has-accessibility-hint`: off
      - `has-valid-accessibility-role`: error
      - `has-valid-accessibility-state`: error
      - `has-valid-accessibility-actions`: error
      - `no-nested-touchables`: error
- **Naming:** port RN-TEMPO's `@typescript-eslint/naming-convention` block (fetch with `gh api repos/Abdelrahman-Yasser-1/RN-TEMPO/contents/template/.eslintrc.js`). Changes:
  - Remove the enum rules, since enums are forbidden via `no-restricted-syntax` `TSEnumDeclaration`.
  - Keep the boolean prefixes from §C5.
- **Other rules:**
  - `consistent-type-imports` (`fixStyle: 'inline-type-imports'`), `consistent-type-exports`.
  - `no-console`: error.
  - `eqeqeq`: error.
  - `curly`: all.
  - `no-restricted-syntax`: TSEnumDeclaration.
- **Commit:** `feat(eslint-config): add typescript and react base configs`

**1.4 eslint-config: quality plugins**
- **Plugins:**
  - `sonarjs` recommended. Set `cognitive-complexity` to 15 as an error.
  - `unicorn`, curated. Enable only:
    - `prefer-node-protocol`
    - `no-array-for-each`
    - `prefer-string-replace-all`
    - `no-useless-undefined`
    - `prefer-ternary` (warn)
    - `filename-case` (off; ls-lint covers it)
    - `no-null` (off)
    - `prevent-abbreviations` (off)
  - `promise` recommended.
  - `regexp` recommended.
  - `jsdoc` with `require-jsdoc` on exported functions under `src/services/**` and `src/shared/**` only.
  - `no-secrets` (`tolerance: 4.5`).
  - `import-x`: `order` with groups builtin/external/internal (aliases)/parent/sibling, alphabetized, and newlines between groups. `no-cycle`: error. `no-default-export`: error, except `*.stories.tsx`, `*.config.*` and `index.js`.
  - `@tanstack/query` recommended.
  - `i18next/no-literal-string` in `markupOnly` mode for `src/**/*.tsx`, ignoring `testID`, `accessibilityRole`, `name`, `variant` and `style` props.
- **Tests:** `testing-library/react` recommended and `jest` recommended for `**/*.test.ts(x)`. Rule `testing-library/prefer-screen-queries`. Add a custom `no-restricted-syntax` rule forbidding `getByTestId` when a `getByRole` alternative exists; the reviewer judges it, so set it to **warn**.
- **`no-restricted-imports`** (error):
  - `react-native` imports `Text`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `Image`, `StyleSheet`, `Button`, `TextInput`: "use @shared/components / react-native-unistyles".
  - `react-native-config`: "use @config/env". Allowed only in `src/config/env.ts`.
  - `@react-native-async-storage/async-storage`: "use @services/storage".
  - `axios`: allowed only in `src/services/http/**`.
  - `react-native-mmkv`: allowed only in `src/services/storage/**`.
  - `react-native-keychain`: allowed only in `src/services/secure-storage/**` and `src/services/storage/encryptionKey.ts`.
- **Commit:** `feat(eslint-config): add quality and restriction rules`

**1.5 eslint-config: structure** (enabled when `structure: true`)
- **`eslint-plugin-boundaries` 7.** Element types and patterns:

  | Type | Pattern |
  |---|---|
  | `app` | `src/app/**` |
  | `navigation` | `src/navigation/**` |
  | `feature` | `src/features/*/**`, capture `feature` |
  | `shared-ui` | `src/shared/{components,hooks}/**` |
  | `shared-core` | `src/shared/{utils,types,constants}/**` |
  | `services` | `src/services/**` |
  | `theme` | `src/theme/**` |
  | `assets` | `src/assets/**` |
  | `locales` | `src/locales/**` |
  | `config` | `src/config/**` |
  | `test-utils` | `src/test-utils/**` |

- **Allowed dependencies** (everything else is an error):

  | From | May import |
  |---|---|
  | `app` | navigation, feature (**only its `index.ts`**), shared-ui, shared-core, services, theme, assets, config, locales |
  | `navigation` | feature (index only), shared-ui, shared-core, services, theme, config |
  | `feature` | same feature (anything); other feature (index only); shared-ui, shared-core, services, theme, assets, config; navigation (`types.ts`, `navigationRef.ts` only) |
  | `shared-ui` | shared-ui, shared-core, services, theme, assets, config |
  | `shared-core` | shared-core, config |
  | `services` | services, shared-core, config, locales |
  | `theme` | theme |
  | `config` | config |
  | `test-utils` | anything |

  Additional rules:
  - Only `*.test.ts(x)`, `*.stories.tsx` and `src/test-utils/**` may import `test-utils`.
  - Use the v7 rule names. Verify with context7 whether that is `boundaries/element-types` or `boundaries/dependencies` in v7, plus `boundaries/entry-point` for index-only imports.
- **`eslint-plugin-project-structure`** `folderStructure` rule: encodes §C5 exactly. Required pairs:
  - Every `src/shared/components/<X>/` must contain `<X>.tsx`, `<X>.test.tsx`, `<X>.stories.tsx` and `index.ts`.
  - Every `screens/<X>Screen/` must contain `<X>Screen.tsx`, `<X>Screen.test.tsx` and `index.ts`.
  - Unknown folders under `src/` or a feature root are errors.
- **Tests:** fixtures in `packages/eslint-config/test/fixtures/{valid,invalid}/src/...` plus a vitest test that runs the ESLint API and asserts the expected rule IDs fire. At least 12 invalid cases:
  1. shared importing a feature
  2. a deep import into another feature
  3. services importing shared-ui
  4. raw `Text`
  5. `react-native-config` outside env
  6. an enum
  7. `console`
  8. a missing story file
  9. an unknown folder
  10. a non-test file importing test-utils
  11. a default export
  12. a literal string in JSX
- **Commits:**
  - `feat(eslint-config): add import boundaries`
  - `feat(eslint-config): add folder structure rules`
  - `test(eslint-config): add rule fixtures`

**1.6 Template wiring**
- **`template/eslint.config.mjs`:** `import { createConfig } from '@rn-tempo/eslint-config'; export default createConfig({ root: import.meta.dirname, structure: true });` plus ignores for `android`, `ios`, `vendor`, `coverage`, `.rnstorybook/storybook.requires.ts` and `e2e`.
- **`.ls-lint.yml`:**
  ```yaml
  ls:
    src:
      .dir: kebab-case | PascalCase
      .ts: camelCase | regex:[a-z][a-zA-Z0-9]*\.(store|api|d)
      .tsx: PascalCase
      .test.ts: camelCase | regex:[a-z][a-zA-Z0-9]*\.(store|api)
      .test.tsx: PascalCase
      .stories.tsx: PascalCase
      .json: kebab-case
    e2e:
      .yaml: kebab-case
  ignore: [node_modules, android, ios, vendor, coverage, .git, .rnstorybook]
  ```
  The implementer verifies ls-lint's regex syntax against its docs.
- **`knip.json`:** entry `index.js`, `src/app/App.tsx`, `.rnstorybook/index.tsx`; project `src/**/*.{ts,tsx}`; ignore generated asset indexes.
- **`i18next.config.ts`:** locales `['en','ar']`, input `src/**/*.{ts,tsx}`, output `src/locales/{{language}}/{{namespace}}.json`, `defaultNS: 'common'`, `failOnWarnings: true` for the `extract --ci` / `lint` commands. Confirm the command names via context7.
- **Template scripts:**
  - `lint`: `eslint . --max-warnings=0`
  - `lint:fix`: `eslint . --fix`
  - `format`: `prettier --write .`
  - `format:check`
  - `lint:files`: `ls-lint`
  - `lint:deadcode`: `knip`
  - `i18n:check`: `i18next-cli lint && i18next-cli extract --ci`
  - `typecheck`: `tsc --noEmit`
  - `verify`: `yarn typecheck && yarn lint && yarn lint:files && yarn i18n:check && yarn test --ci`
  - `verify:changed`: `node scripts/verify-changed.mjs`. Runs eslint, prettier and ls-lint on the changed files (`git diff --name-only HEAD` + staged), then `tsc`, then `jest --findRelatedTests`.
- **Done when:** `yarn verify` passes on the skeleton, and putting a fixture violation into `src` makes it fail.
- **Commits:**
  - `build(template): wire shared eslint and prettier configs`
  - `build(template): add ls-lint knip and i18n checks`
  - `build(template): add verify scripts`

**1.7 Template lefthook** (`template/lefthook.yml`; shipped to projects)
```yaml
pre-commit:
  parallel: true
  commands:
    eslint: { glob: "*.{ts,tsx,js,mjs}", run: "yarn eslint --fix --max-warnings=0 {staged_files}", stage_fixed: true }
    prettier: { glob: "*.{ts,tsx,js,mjs,json,md,yml,yaml}", run: "yarn prettier --write {staged_files}", stage_fixed: true }
    ls-lint: { run: yarn ls-lint }
    typecheck: { glob: "*.{ts,tsx}", run: yarn tsc --noEmit }
    env-guard: { glob: "{.env.staging,.env.prod,*.keystore,*.jks,*.p12,*.mobileprovision}", run: "echo 'Refusing to commit secrets: {staged_files}' && exit 1" }
    gitleaks: { run: gitleaks protect --staged --redact }
    stage-ai-session: { run: node scripts/ai-log/stage-session.mjs }
prepare-commit-msg:
  commands: { ai-trailers: { run: node scripts/ai-log/add-trailers.mjs {1} {2} } }
commit-msg:
  commands: { commitlint: { run: yarn commitlint --edit {1} } }
pre-push:
  commands:
    test: { run: yarn jest --ci --changedSince=origin/main --passWithNoTests }
    doctor: { run: yarn tempo doctor --ci || true }   # becomes blocking after WS5 publishes
```
- **Commit:** `build(template): add lefthook hooks`

---
