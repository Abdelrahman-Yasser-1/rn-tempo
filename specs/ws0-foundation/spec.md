---
status: in-progress
owner: integrator (Claude Opus)
created: 2026-10-24
plan: ../PLAN.md
---

# WS0 — Foundation & contracts (Wave 0, serial)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** everything at this stage.

## Acceptance criteria
- **AC-1** `yarn --version` prints 4.18.1 and `git status` is clean after the commit.
- **AC-2** `yarn android` and `yarn ios` launch the default RN screen. Paste screenshots into the PR.
- **AC-3** 
- **AC-4** 
- **AC-5** 
- **AC-6** `yarn tsc --noEmit` passes and `import { ENV } from '@config/env'` resolves at runtime. Test with a temporary log, then remove it.
- **AC-7** `yarn workspace @rn-tempo/contracts test` passes, and every manifest validates against the schema (a test loops over the files).
- **AC-8** every WS has a spec and tasks file, and the ADRs are listed in `specs/adr/README.md`.
- **AC-9** a test PR shows every job green.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS0 — Foundation & contracts (Wave 0, serial)
**Owns:** everything at this stage.
**Branch prefix:** `ws0/`.

**0.1 Repo bootstrap**
- **Files:** root `package.json` (§C1), `.yarnrc.yml`, `.nvmrc`, `.gitignore` (node, macOS, IDE, `.ai/.current.json`, `.env*` except `.env.example` and `.env.dev`), `.editorconfig` (2 spaces, LF, utf-8, final newline), `.gitattributes` (`* text=auto eol=lf`, `*.png binary`, `*.jar binary`), `LICENSE` (MIT, the owner's name), `README.md` (title, one-paragraph purpose, links to docs and structure).
- **Steps:**
  1. `git clone git@github.com:Abdelrahman-Yasser-1/rn-tempo.git`.
  2. `corepack enable && yarn set version 4.18.1`.
  3. Create the files.
  4. `yarn install`.
- **Done when:** `yarn --version` prints 4.18.1 and `git status` is clean after the commit.
- **Commit:** `chore(repo): initialize monorepo with yarn 4 workspaces`

**0.2 RN app init**
- **Steps:**
  ```
  npx @react-native-community/cli@20.2.0 init TempoApp --version 0.88.0 --directory template \
    --package-name com.rntempo.app --title "Tempo" --pm yarn --skip-git-init --install-pods false --skip-install
  ```
  Then:
  1. Delete `template/.git` if it was created.
  2. Add `template/.yarnrc.yml` (`nodeLinker: node-modules`).
  3. Set `packageManager` in `template/package.json`.
  4. `cd template && yarn install && cd ios && bundle install && bundle exec pod install`.
- **Done when:** `yarn android` and `yarn ios` launch the default RN screen. Paste screenshots into the PR.
- **Commits:**
  - `chore(template): scaffold react native 0.88 app`
  - `chore(ios): install pods` (Pods are gitignored; commit only `Podfile.lock`)

**0.3 AI session tracking (dogfood from here on)**
- **Files:** `template/scripts/ai-log/{session-start,prompt,session-stop,add-trailers,stage-session,redact,report,lint-edited}.mjs` (behavior per §C9), `template/scripts/ai-log/README.md`, root `.claude/settings.json` (commands prefixed with `template/`), `template/.claude/settings.json`, root and template `.ai/redact.json`, `.ai/sessions/.gitkeep`.
- **Steps:**
  1. Write the scripts with no npm dependencies.
  2. Add unit tests with `node --test` in `template/scripts/ai-log/__tests__/*.test.mjs`, covering:
     - redaction patterns
     - frontmatter update
     - trailer idempotency
     - `logPrompts` modes
  3. Template `package.json` scripts: `"ai:start"`, `"ai:prompt"`, `"ai:stop"`, `"ai:report"`, `"test:ai-log": "node --test scripts/ai-log/__tests__"`.
- **Done when:**
  - `yarn test:ai-log` passes.
  - Running Claude Code in the repo creates a session file with the prompt.
  - `echo '{"session_id":"x","prompt":"token=abc123"}' | node template/scripts/ai-log/prompt.mjs` writes `[REDACTED]`.
- **Commits:**
  - `feat(ai): add session logging scripts`
  - `test(ai): cover redaction and trailers`
  - `chore(ai): wire claude code hooks`

**0.4 Commit conventions and hooks (root)**
- **Files:**
  - `packages/commitlint-config/{package.json,index.mjs,rules/ai-session-trailer.mjs,README.md}`: extends `@commitlint/config-conventional` with the §C10 types and scopes, plus the local plugin rule.
  - Root `commitlint.config.mjs`: `export default { extends: ['@rn-tempo/commitlint-config'] }`.
  - Root `lefthook.yml`:
    ```yaml
    pre-commit:
      parallel: false
      commands:
        stage-ai-session: { run: node template/scripts/ai-log/stage-session.mjs }
        gitleaks: { run: gitleaks protect --staged --redact -v || (echo "install gitleaks: brew install gitleaks" && exit 1) }
    prepare-commit-msg:
      commands:
        ai-trailers: { run: node template/scripts/ai-log/add-trailers.mjs {1} {2} }
    commit-msg:
      commands:
        commitlint: { run: yarn commitlint --edit {1} }
    ```
  - Vitest tests for the rule in `packages/commitlint-config/rules/ai-session-trailer.test.mjs`.
- **Done when:**
  - `git commit -m "bad"` fails.
  - `git commit -m "chore(repo): ok"` passes.
  - A commit with `AI-Assisted` but no `AI-Session` fails.
- **Commits:**
  - `feat(commitlint-config): add conventional rules and scopes`
  - `feat(commitlint-config): add ai-session-trailer rule`
  - `chore(repo): add lefthook hooks`

**0.5 Dependency snapshot** (one PR; everything installed up front so WS1–WS13 never touch lockfiles)
- **Steps:**
  1. Re-check every §B3 version with `npm view`. Update §B3 in `VERSIONS.md` (not in this plan) if anything is newer **and** its peer dependencies are satisfied.
  2. In `template/`, `yarn add -E` all runtime deps, then `yarn add -E -D` all dev deps from §B3. Groups:
     - (a) navigation + UI natives
     - (b) state/data/forms
     - (c) storage/security/config
     - (d) i18n
     - (e) testing
     - (f) storybook + devtools
     - (g) lint/quality tooling
  3. Run `bundle exec pod install`.
  4. Add the required Babel plugins only: `react-native-unistyles/plugin` with `{ root: 'src' }`, `module-resolver` with the §C4 aliases, and `react-native-worklets/plugin` **last**.
  5. Metro: wrap with the svg transformer config. Storybook wrapping happens in WS4.
  6. Make sure the app still launches (it may show the default screen).
- **Done when:**
  - `yarn install --immutable` passes.
  - Both platforms build in `Debug`.
  - The `VERSIONS.md` table lists every package with its version and why, if it isn't the latest.
- **Commits:** one per group, `build(deps): add <group> dependencies`, then `build(ios): update pods` and `build(template): configure babel and metro`.

**0.6 Aliases, skeleton, contracts in code**
- **Files:**
  - `template/tsconfig.json`: extends `@react-native/typescript-config`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, the §C4 paths.
  - The full §C5 tree with `index.ts` placeholders (`export {}`) and `.gitkeep`s.
  - `src/config/env.ts` (§C3), `.env.example` and `.env.dev` (§C3).
  - `src/theme/tokens.ts` (§C6 shape, with values `TODO(WS3)` replaced by temporary neutral greys so it compiles).
  - `src/navigation/types.ts` (§C12).
  - `src/services/flags/flags.ts` (§C15).
  - `src/test-utils/` empty barrels.
- **Done when:** `yarn tsc --noEmit` passes and `import { ENV } from '@config/env'` resolves at runtime. Test with a temporary log, then remove it.
- **Commits:**
  - `chore(template): add path aliases`
  - `chore(template): add folder skeleton`
  - `feat(env): add zod-validated env config`
  - `feat(theme): add token contract`
  - `feat(navigation): add route types contract`

**0.7 Contracts package**
- **Files:** `packages/contracts/{package.json,schemas/feature-manifest.schema.json,schemas/tempo.schema.json,schemas/ai-session.schema.json,src/index.ts (TS types generated or hand-written to match),src/markers.ts (marker regex constants per §C7.2),README.md}`, plus vitest tests that validate sample JSON.
  - Also `template/.tempo/features/*.json`: one manifest per §C7.1 module, filled in from the knowledge in this plan. Each WS updates the `deleteGlobs` for its own module.
  - Also `template/.tempo.json` (§C8, template defaults).
- **Done when:** `yarn workspace @rn-tempo/contracts test` passes, and every manifest validates against the schema (a test loops over the files).
- **Commits:**
  - `feat(contracts): add json schemas and marker spec`
  - `feat(template): add feature manifests and tempo metadata`

**0.8 Repo docs, specs, ADRs**
- **Files:**
  - Root `AGENTS.md`: purpose, repo map, the §A rules summarized, commands, contracts index pointing to `packages/contracts` and this plan's text copied into `specs/PLAN.md`.
  - `CLAUDE.md` (`@AGENTS.md` import + Claude-specific notes).
  - `specs/PLAN.md`: a **verbatim copy of this plan**.
  - `specs/ws<N>-<slug>/{spec.md,tasks.md}` for WS1–WS14. Each `spec.md` holds goal, scope, owns-paths and acceptance criteria (AC-n copied from the Done-when lines). Each `tasks.md` has a checkbox per task ID.
  - `VERSIONS.md`.
  - ADR stubs in `docs/content/docs/adr/` (created by WS6; until then keep them in `specs/adr/` and WS6 moves them):
    - 001-monorepo-layout
    - 002-zustand-tanstack-query
    - 003-unistyles
    - 004-typescript-6
    - 005-eslint-10-flat-no-rn-config
    - 006-maestro
    - 007-own-cli-feature-markers
    - 008-ai-session-tracking
    - 009-static-navigation
    - 010-app-config-endpoint-instead-of-firebase
    - 011-yarn4
    - 012-no-expo-modules
  - Each ADR follows the format Context / Decision / Consequences / Alternatives.
- **Done when:** every WS has a spec and tasks file, and the ADRs are listed in `specs/adr/README.md`.
- **Commits:**
  - `docs(specs): add plan and workstream specs`
  - `docs(specs): add architecture decision records`
  - `docs(repo): add agents guide`

**0.9 Root CI skeleton**
- **Files:** `.github/workflows/ci.yml`: on PR and push to main. Jobs:
  - `packages`: yarn install, lint/test/typecheck for each workspace.
  - `template-js`: `cd template && yarn install --immutable && yarn tsc --noEmit && yarn test:ai-log`.
  - `commitlint`: `wagoid/commitlint-github-action` with the repo config, checking every commit in the PR.
  - `gitleaks`: gitleaks-action.
  - Also `.github/pull_request_template.md` (§C10.4), `CODEOWNERS` (`* @Abdelrahman-Yasser-1`), and the `changeset` init (`.changeset/config.json`, `access: public`, base `main`).
- **Done when:** a test PR shows every job green.
- **Commits:**
  - `ci(repo): add pull request pipeline`
  - `chore(release): initialize changesets`

**0.10 Branch protection** (owner action, documented in the PR): require CI + 1 review, linear history, rebase merge only.

---
