# AGENTS.md

Guide for every contributor, human or AI agent, working on this app. Tool-specific files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`) are generated from this file and `ai/`; do not edit the generated ones.

## Project overview

A React Native app created from RN-TEMPO. Product context, glossary, environments and deviations from the template are in [`PROJECT.md`](PROJECT.md). Feature specs are in [`specs/`](specs/README.md). If anything is unspecified or ambiguous, **stop and ask**; never invent.

## Stack

| Area         | Choice                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Runtime      | React Native 0.88 (RN CLI, no Expo), React 19, TypeScript (strict), Hermes                         |
| Navigation   | React Navigation 7, static API                                                                     |
| Styling      | react-native-unistyles 3 (theme tokens, variants)                                                  |
| Client state | Zustand 5                                                                                          |
| Server state | TanStack Query 5 + axios behind `@services/http`, Zod-validated responses                          |
| Forms        | react-hook-form + Zod                                                                              |
| Storage      | react-native-mmkv (encrypted), react-native-keychain for tokens                                    |
| i18n         | i18next + react-i18next, `en` and `ar` (RTL)                                                       |
| Tests        | Jest 30, React Native Testing Library 14, MSW 3, Maestro (E2E)                                     |
| Quality      | ESLint 10 (strict, boundaries, structure), Prettier, ls-lint, knip, lefthook, commitlint, gitleaks |
| Envs         | `dev`, `staging`, `prod` (native flavors/schemes, `.env.<env>`)                                    |

## Commands

Run everything from the project root.

| Command                                                    | Purpose                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `yarn install && yarn pods`                                | Install JS deps and iOS pods                                                                                     |
| `yarn start`                                               | Metro                                                                                                            |
| `yarn ios:dev` / `yarn android:dev`                        | Run the dev app (also `:staging`, `:prod`)                                                                       |
| `yarn verify`                                              | Typecheck, lint, dependency ownership, env files, feature READMEs, node tests, format, ls-lint, i18n, knip, jest |
| `yarn verify:changed` (`--pr`)                             | Same checks scoped to changed files; full `verify` when a config changed; `--pr` prints a Markdown report        |
| `yarn verify:bundle`                                       | Production bundle dry run for iOS and Android (slow, not in `verify`)                                            |
| `yarn test:node`                                           | Every `node --test` suite under `scripts/`                                                                       |
| `yarn lint:env`                                            | Every `.env.*` has the keys of `.env.example`; root `.env` is untracked                                          |
| `yarn lint:readmes`                                        | Every feature has a README whose Public API lists exactly the exports of its `index.ts`                          |
| `yarn fresh-install` / `yarn android:reverse`              | Clean caches, `node_modules`, reinstall; forward Metro to an Android device                                      |
| `yarn lint:fix` / `yarn format`                            | Auto-fix lint and formatting                                                                                     |
| `yarn test` / `yarn jest <path>`                           | Jest                                                                                                             |
| `yarn typecheck`                                           | `tsc --noEmit`                                                                                                   |
| `yarn i18n:check`                                          | Locale keys identical in `en` and `ar`, none missing                                                             |
| `yarn lint:deadcode`                                       | knip                                                                                                             |
| `yarn spec:check`                                          | Every AC of implemented specs is covered by a test                                                               |
| `yarn tempo g <kind> ...`                                  | Generators (when the CLI is installed; see `ai/rules/generators.md`)                                             |
| `yarn icons:search <term>` / `yarn icons:add <name\|file>` | Find an icon; add your own SVG or a Tabler icon (see Add an icon)                                                |
| `yarn icons:prune` (`--restore`)                           | Release builds only: keep just the icons the code uses                                                           |
| `yarn assets` / `yarn assets:check`                        | Validate `src/assets`, generate (or verify) `src/assets/generated`                                               |
| `yarn ai:sync`                                             | Regenerate tool files from `ai/` (after editing `ai/`)                                                           |
| `yarn ai:start` / `ai:prompt` / `ai:stop` / `ai:report`    | AI session logging                                                                                               |

## Folder map

```
src/
  app/          App.tsx, providers/, bootstrap/, screens/ (force update, maintenance, not found, debug)
  navigation/   navigators, linking, types.ts (route names and params), navigationRef.ts
  features/<kebab>/  api/ components/ hooks/ screens/ store/ types/ utils/ constants.ts index.ts
  shared/       components/ hooks/ utils/ constants/ types/   (feature-agnostic)
  services/<kebab>/  http, storage, secure-storage, security, flags, remote-config, logger, i18n, linking, toast, network, crash-reporting, firebase
  theme/        tokens, themes, scaling
  assets/       fonts, images, icons, animations, generated/ (built by `yarn assets`)
  locales/      en/<ns>.json, ar/<ns>.json
  config/       env.ts, parseEnv.ts, constants.ts
  test-utils/   renderWithProviders, msw/, factories/
ai/             sources for all AI tool files (rules, skills, commands, agents)
specs/          product.md, tech.md, one folder per feature
scripts/        ai-log, ai-sync, assets and icons-add, native helpers, verify-changed, spec-check
```

Aliases: `@app` `@navigation` `@features` `@shared` `@services` `@theme` `@assets` `@locales` `@config` `@test-utils`, each mapping to `src/<name>`. They live in `tsconfig.json` `paths` only (Babel, Jest and ESLint read them); import through them, never through `../`. Barrels name their exports (`export { A } from './A'`), never `export *`. A new runtime dependency needs an ownership entry in `eslint.config.mjs` (`yarn lint:deps`).

## Golden rules

1. Read the rule file in `ai/rules/` for what you are touching before you write code.
2. Imports follow the boundary matrix; other features are imported only through their `index.ts`.
3. No `any`, no `@ts-ignore`, no `eslint-disable` without a `-- reason`, no `console` (use `@services/logger`), no enums, no default exports.
4. No literal `TODO` or `FIXME` comments; write hand-off notes as `WS<N> (task x.y): ...`.
5. Every UI string goes through i18n, in both `en` and `ar`.
6. Style with Unistyles tokens only; no color literals, magic numbers, inline styles, or `StyleSheet` from `react-native`. Use `start`/`end`, not `left`/`right`.
7. Compose UI from `@shared/components`; raw `Text`, `Image`, `Button`, `TextInput` and Touchables are lint errors outside `src/shared/components`.
8. Screens render, hooks think: a screen's logic (navigation, forms, queries, state, effects, error mapping) lives in `use<Name>Screen.ts` next to the view and is tested with `renderHook`; the view only lays out JSX.
9. Component props are `Readonly<Props>`; use `type`, never `interface`.
10. Server data lives in TanStack Query, client state in Zustand; tokens never go in stores or MMKV.
11. All HTTP goes through `request()` with a Zod schema; env through `ENV` from `@config/env`; storage through `@services/storage`.
12. Accessibility props, 44x44 targets and `testID` conventions on every interactive component.
13. Every new util, hook, store, service, component and screen has a test. Query with `getByRole`; mock the network with MSW; spec'd tests start with `AC-n:`.
14. Use generators (`yarn tempo g ...`) instead of hand-creating files when available.
15. Small Conventional Commits `type(scope): subject` (scope required, about 200 lines max, each one green); never `--no-verify`.
16. Run `yarn verify:changed` before finishing and `yarn verify` before pushing; never claim done with failing checks.

Also: check library APIs with context7 for the **pinned** version, never from memory. Dependencies are exact pins; add, remove or upgrade them only when the task says so, in a separate `deps` commit. Never commit secrets.

## Do not touch

- `src/assets/generated/**`: run `yarn assets`.
- Generated AI files (`CLAUDE.md`, `.claude/`, `.cursor/`, `.github/copilot-instructions.md`, nested `AGENTS.md` files, `.github/prompts/`): edit `ai/`, then `yarn ai:sync`.
- `ios/Pods`, `ios/build`, `android/build`, `android/app/build`, `.gradle`.
- `yarn.lock` by hand; use `yarn add -E`. `ios/Podfile.lock` unless pods changed.
- `.env.staging` and `.env.prod`: secrets, never committed. `.env` is a copy made by the iOS scheme; keep it untracked.
- Other people's `.ai/sessions` logs.

## Definition of Done

- `yarn verify` is green with zero warnings.
- Tests cover every new unit (see Testing); spec ACs are covered (`yarn spec:check`).
- New i18n keys exist in `en` and `ar`.
- Accessibility props on interactive UI.
- A docs page or recipe for anything a user must know.
- UI checked on iOS and Android, light and dark, `en` and `ar` (RTL).

## Gotchas

- Metro drops dev-only code only for the exact shape `if (__DEV__) { require(...) }` (or the guarded ternary in `App.tsx`). Any other shape ships the code.
- RNTL 14 `render` and `fireEvent` are async: `await` both.
- The Unistyles jest mock does not resolve variants; assert on props, not on variant styles.
- The Reanimated jest mock (`__mocks__/react-native-reanimated.ts`) supports shared `.value` and `.set` only.
- The i18n extractor keeps only keys it can read: `t('a.b')` calls and `// t('a.b', { ns })` comment hints next to keys stored as data. Keys built at runtime are removed from the locale files; template-literal keys and the selector form `t(($) => $.a.b)` are lint errors.
- `@gorhom/bottom-sheet` modals need `accessible={false}`, or screen readers see one merged node. Never `dismiss()` a modal that was not presented.
- Android: a custom font family with a non-400 `fontWeight` clips text (Arabic most). Use `'400'`; the family name carries the weight.
- Static navigation screens get only `route`; use `useNavigation()` and mock the hook in tests, never pass a `navigation` prop.
- A Pressable under an absolutely positioned `box-none` sibling can miss taps on Android; lay triggers out as rows.
- Maestro (not app bugs): taps during a push animation are lost; right after a sheet opens (iOS) too; `label:` is not a selector; env values with spaces fail; iOS `hideKeyboard` fails (tap a non-input) and the "Save Password?" sheet needs `text: Not Now`; Android `openLink` may not navigate (use `adb shell am start -a android.intent.action.VIEW -d <url> <pkg>`). Confirm a failure on a settled screen before filing a bug.
- macOS is case-insensitive, CI is not: file names that differ only by case pass locally and fail in CI.

## Testing

Rules and examples: `ai/rules/testing.md`. RNTL 14 API: <https://callstack.github.io/react-native-testing-library/>. Test behaviour through roles and labels, mock the network with MSW, name spec'd tests `AC-n: ...`.

## Where the rules live

One topic per file in `ai/rules/`; the examples there are the source of truth.

| File              | Covers                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `architecture.md` | Folder skeleton, aliases, barrels, boundary matrix, restricted imports |
| `naming.md`       | File, identifier and boolean naming, no enums                          |
| `styling.md`      | Unistyles, tokens, scaling, RTL                                        |
| `state.md`        | Zustand vs Query, storage keys, tokens                                 |
| `api.md`          | `request()`, Zod, key factories, mutations                             |
| `i18n.md`         | Namespaces, keys, RTL, lint                                            |
| `a11y.md`         | Roles, labels, states, targets                                         |
| `forms.md`        | FormBuilder when `dynamic-forms` is on, hand-written forms otherwise   |
| `testing.md`      | RNTL, MSW, `renderWithProviders`, AC IDs                               |
| `security.md`     | Env, secrets, tokens, pinning                                          |
| `commits.md`      | Conventional Commits, scopes, AI trailers                              |
| `specs.md`        | Spec flow and formats                                                  |
| `generators.md`   | `yarn tempo g ...`                                                     |
| `assets.md`       | Icons: add, use, RTL mirroring, the catalogue                          |
| `verification.md` | Checks to run, definition of done                                      |

Skills, commands and subagents are in `ai/skills`, `ai/commands` and `ai/agents`. After editing anything in `ai/`, run `yarn ai:sync` and commit the generated files.

Vendored third-party skills (React Native performance, advanced TypeScript types) live in `ai/skills/` with their licenses; `ai/skills-lock.json` pins each commit and `yarn ai:skills:update` refreshes them. Do not edit them by hand.

MCP servers are configured in `.mcp.json` (copied to `.cursor/mcp.json` by `yarn ai:sync`). Packages run through `npx` are pinned to an exact version older than 24 hours and are bumped deliberately, never with `latest`.

## Add an icon

Every Tabler icon is already in `src/assets/icons/` and in the `IconName` autocomplete: `yarn icons:search arrow`, then `<Icon name="arrow-left" />`. To add one, drop `my-icon.svg` into `src/assets/icons/` and run `yarn assets`, or run `yarn icons:add <tabler-name|path.svg>` (add `--filled` or `--as <name>`); the name is in autocomplete at once. Commit the SVG and `src/assets/generated/`. Directional icons (arrows, chevrons, `logout`, ...) flip in RTL on their own. Release builds prune unused icons (`yarn icons:prune`; names built at runtime go in `src/assets/icons.keep.ts`). Details: `ai/rules/assets.md`.

## Specs flow

Features are spec-driven: `specs/<feature>/{spec.md, design.md, tasks.md}`.

1. `/spec` writes `spec.md` (status `draft`) with acceptance criteria `- **AC-1** Given ..., when ..., then ...`.
2. A human sets `approved`.
3. `/plan` writes `design.md` and `tasks.md` (`- [ ] T1 (AC-1) <summary> — commit: feat(<scope>): <subject>`).
4. `/implement` does one task per commit and ticks its box in that commit.
5. Set `implemented` when all tasks are done, `verified` after QA or E2E.

`yarn spec:check` fails when an AC in an `implemented` or `verified` spec has no test whose name starts with its ID (or Maestro flow tagged with it). Details in `ai/rules/specs.md`.

## AI session logging

AI sessions are logged locally in `.ai/sessions/`. The logs are gitignored and never committed.

- Claude Code logs automatically through `.claude/settings.json` hooks.
- Other tools: `yarn ai:start --tool <tool> --model <model> [--spec specs/<feature>]`, then `yarn ai:prompt "<prompt>"` per prompt and `yarn ai:stop --summary "<summary>"` at the end (or the `/log` command).
- While a session is active, commits get `AI-Assisted` and `Spec` trailers (no `AI-Session`). Never commit or `git add -f` a session log.
- The session pointer expires after 12 hours; start again when resuming.
- Prompts are redacted (tokens, keys, emails); do not paste secrets. Set `ai.logPrompts` in `.tempo.json` to `summary` or `off` to log less.
- Never edit a session log created by another session.

## Docs

The RN-TEMPO documentation explains every file and recipe. LLM-friendly index: `https://<docs-site>/llms.txt` (replace `<docs-site>` with the deployed docs host; see `PROJECT.md`).
