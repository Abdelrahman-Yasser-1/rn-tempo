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

| Command                                                 | Purpose                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `yarn install && yarn pods`                             | Install JS deps and iOS pods                                         |
| `yarn start`                                            | Metro                                                                |
| `yarn ios:dev` / `yarn android:dev`                     | Run the dev app (also `:staging`, `:prod`)                           |
| `yarn verify`                                           | Typecheck, lint, format check, ls-lint, i18n check, tests            |
| `yarn verify:changed`                                   | Same checks scoped to changed files (run before finishing)           |
| `yarn lint:fix` / `yarn format`                         | Auto-fix lint and formatting                                         |
| `yarn test` / `yarn jest <path>`                        | Jest                                                                 |
| `yarn typecheck`                                        | `tsc --noEmit`                                                       |
| `yarn i18n:check`                                       | Locale keys identical in `en` and `ar`, none missing                 |
| `yarn lint:deadcode`                                    | knip                                                                 |
| `yarn spec:check`                                       | Every AC of implemented specs is covered by a test                   |
| `yarn tempo g <kind> ...`                               | Generators (when the CLI is installed; see `ai/rules/generators.md`) |
| `yarn ai:sync`                                          | Regenerate tool files from `ai/` (after editing `ai/`)               |
| `yarn ai:start` / `ai:prompt` / `ai:stop` / `ai:report` | AI session logging                                                   |

## Folder map

```
src/
  app/          App.tsx, providers/, bootstrap/, screens/ (force update, maintenance, not found, debug)
  navigation/   navigators, linking, types.ts (route names and params), navigationRef.ts
  features/<kebab>/  api/ components/ hooks/ screens/ store/ types/ utils/ constants.ts index.ts
  shared/       components/ hooks/ utils/ constants/ types/   (feature-agnostic)
  services/<kebab>/  http, storage, secure-storage, security, flags, remote-config, logger, i18n, linking, toast, network
  theme/        tokens, themes, scaling
  assets/       fonts, images, icons, animations (index.ts generated)
  locales/      en/<ns>.json, ar/<ns>.json
  config/       env.ts, constants.ts
  test-utils/   renderWithProviders, msw/, factories/
ai/             sources for all AI tool files (rules, skills, commands, agents)
specs/          product.md, tech.md, one folder per feature
scripts/        ai-log, ai-sync, native helpers, verify-changed, spec-check
```

Aliases: `@app` `@navigation` `@features` `@shared` `@services` `@theme` `@assets` `@locales` `@config` `@test-utils`, each mapping to `src/<name>`.

## Golden rules

1. Read the rule file in `ai/rules/` for what you are touching before you write code.
2. Imports follow the boundary matrix; other features are imported only through their `index.ts`.
3. No `any`, no `@ts-ignore`, no `eslint-disable` without a `-- reason`, no `console` (use `@services/logger`), no enums, no default exports.
4. No literal `TODO` or `FIXME` comments; write hand-off notes as `WS<N> (task x.y): ...`.
5. Every UI string goes through i18n, in both `en` and `ar`.
6. Style with Unistyles tokens only; no color literals, magic numbers, inline styles, or `StyleSheet` from `react-native`. Use `start`/`end`, not `left`/`right`.
7. Compose UI from `@shared/components`; raw `Text`, `Image`, `Button`, `TextInput` and Touchables are lint errors outside `src/shared/components`.
8. Component props are `Readonly<Props>`; use `type`, never `interface`.
9. Server data lives in TanStack Query, client state in Zustand; tokens never go in stores or MMKV.
10. All HTTP goes through `request()` with a Zod schema; env through `ENV` from `@config/env`; storage through `@services/storage`.
11. Accessibility props, 44x44 targets and `testID` conventions on every interactive component.
12. Every new util, hook, store, service, component and screen has a test. Query with `getByRole`; mock the network with MSW; spec'd tests start with `AC-n:`.
13. Use generators (`yarn tempo g ...`) instead of hand-creating files when available.
14. Small Conventional Commits `type(scope): subject` (scope required, about 200 lines max, each one green); never `--no-verify`.
15. Run `yarn verify:changed` before finishing and `yarn verify` before pushing; never claim done with failing checks.

Also: check library APIs with context7 for the **pinned** version, never from memory. Dependencies are exact pins; add, remove or upgrade them only when the task says so, in a separate `deps` commit. Never commit secrets.

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
| `testing.md`      | RNTL, MSW, `renderWithProviders`, AC IDs                               |
| `security.md`     | Env, secrets, tokens, pinning                                          |
| `commits.md`      | Conventional Commits, scopes, AI trailers                              |
| `specs.md`        | Spec flow and formats                                                  |
| `generators.md`   | `yarn tempo g ...`                                                     |
| `verification.md` | Checks to run, definition of done                                      |

Skills, commands and subagents are in `ai/skills`, `ai/commands` and `ai/agents`. After editing anything in `ai/`, run `yarn ai:sync` and commit the generated files.

MCP servers are configured in `.mcp.json` (copied to `.cursor/mcp.json` by `yarn ai:sync`). Packages run through `npx` are pinned to an exact version older than 24 hours and are bumped deliberately, never with `latest`.

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
