---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS8 — Quality gates, CI/CD, VS Code (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/.github/workflows/{pr,build,e2e,release}.yml`, `template/fastlane/**`, `template/Gemfile` (fastlane gem; coordinate with WS2, who owns xcodeproj gem lines — append-only), `template/Dangerfile.ts`, `template/renovate.json`, `template/.vscode/**`, `template/.github/{ISSUE_TEMPLATE,pull_request_template.md,CODEOWNERS}`, `template/release-please-config.json`, `template/.release-please-manifest.json`.

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS8 — Quality gates, CI/CD, VS Code (Wave 1)
**Owns:** `template/.github/workflows/{pr,build,e2e,release}.yml`, `template/fastlane/**`, `template/Gemfile` (fastlane gem; coordinate with WS2, who owns xcodeproj gem lines — append-only), `template/Dangerfile.ts`, `template/renovate.json`, `template/.vscode/**`, `template/.github/{ISSUE_TEMPLATE,pull_request_template.md,CODEOWNERS}`, `template/release-please-config.json`, `template/.release-please-manifest.json`.

**8.1 PR workflow** (`pr.yml`)
- Triggers: `pull_request`. Concurrency cancels in-progress runs.
- Steps:
  1. checkout with fetch-depth 0
  2. setup-node from `.nvmrc` with a yarn cache
  3. `yarn install --immutable`
  4. `yarn verify`
  5. jest coverage summary comment (`ArtiomTr/jest-coverage-report-action` or equivalent)
  6. commitlint on all PR commits
  7. PR title lint (`amannn/action-semantic-pull-request` with the §C10 types and scopes)
  8. `yarn danger ci`
  9. `yarn tempo doctor --ci`, with the output as a sticky comment
  10. gitleaks
- **Commit:** `ci(ci): add pull request workflow`

**8.2 Danger** (`Dangerfile.ts`), warnings unless noted:
- PR over 400 changed lines (excluding lockfiles, `ios/Pods`, `*.png`, `*.pbxproj`, generated asset indexes)
- source changed with no test changed
- `feat` PR without a `specs/` link in the body
- native folders changed (adds the label `native`)
- `AI-Assisted` trailers present but the PR checkbox unchecked (**fail**)
- `package.json` deps changed without a `deps` commit
- **Commit:** `ci(ci): add danger rules`

**8.3 Fastlane**
- `fastlane/Fastfile`, `Appfile`, `Matchfile`, `Pluginfile` (firebase_app_distribution).
- Lanes:
  - `android build env:<dev|staging|prod> type:<apk|aab>`
  - `android beta env:` → Firebase App Distribution
  - `android release` → Play internal track (`supply`)
  - `ios build env:` (match readonly + gym, scheme `TempoApp-<Env>`, configuration `Release-<Env>`)
  - `ios beta env:` (dev/staging → Firebase App Distribution; prod → TestFlight via `pilot`)
  - `ios release` (TestFlight)
- Version: `versionName`/`CFBundleShortVersionString` from `package.json`. Build number = `GITHUB_RUN_NUMBER`, or a timestamp locally.
- Secrets are read from env and documented in `fastlane/README.md` with the full list:
  - `MATCH_GIT_URL`, `MATCH_PASSWORD`
  - `APP_STORE_CONNECT_API_KEY_ID`, `..._ISSUER_ID`, `..._KEY_CONTENT`
  - `FIREBASE_APP_ID_<ENV>_<PLATFORM>`, `FIREBASE_TOKEN` or a service account
  - `PLAY_JSON_KEY`
  - `TEMPO_UPLOAD_*`
  - `ENV_FILE_STAGING`, `ENV_FILE_PROD`
- **Commit:** `feat(fastlane): add build beta and release lanes`

**8.4 Build/E2E/Release workflows**
- **`build.yml`:** `workflow_dispatch` (inputs: env, platform, lane) and tags `v*`. Matrix android (ubuntu) / ios (macos-latest). Writes `.env.<env>` from secrets, sets up ruby/bundler cache, Gradle cache, CocoaPods cache, then runs `bundle exec fastlane <platform> <lane> env:<env>`.
- **`e2e.yml`:** `maestro` on the Android emulator (`reactivecircus/android-emulator-runner`). Builds the `devRelease` APK with `API_MOCKING=true`, installs it, then runs `maestro test e2e/flows --format junit`. Triggers: the PR label `e2e`, plus nightly cron. The `maestro` markers wrap the file (`ci-github` + `maestro`).
- **`release.yml`:** release-please action (`release-type: node`). On release created, dispatch `build.yml` with env prod for both platforms.
- **Commits:** one per workflow.

**8.5 Repo hygiene**
- `renovate.json`: extends `config:recommended`; groups `react-native` + `@react-native/*` + `@react-native-community/cli*` ("react-native"), `@react-navigation/*`, testing, storybook, eslint; `rangeStrategy: pin`; automerge devDependencies minor/patch when CI passes; schedule weekly.
- Issue templates (bug, feature), PR template (§C10.4), CODEOWNERS (`/android/ /ios/ @<mobile-leads>`, `/.github/ @<owner>`).
- **Commit:** `chore(ci): add renovate and repo templates`

**8.6 VS Code**
- **`settings.json`:**
  - Formatting: `editor.formatOnSave`, `editor.defaultFormatter: esbenp.prettier-vscode`, `editor.codeActionsOnSave: { "source.fixAll.eslint": "explicit" }`, `eslint.useFlatConfig: true`.
  - TypeScript: `typescript.tsdk: node_modules/typescript/lib`, `typescript.preferences.importModuleSpecifier: non-relative`.
  - **File nesting** enabled with the patterns `"*.tsx": "${capture}.test.tsx, ${capture}.stories.tsx, styles.ts, types.ts"` and `"package.json": "yarn.lock, .yarnrc.yml, .nvmrc"`.
  - `files.exclude` / `search.exclude` for `ios/Pods`, `android/build`, `coverage`.
  - i18n-ally: `localesPaths src/locales`, `namespace: true`, `pathMatcher: {locale}/{namespaces}.json`.
- **`extensions.json`:** `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`, `msjsdiag.vscode-react-native`, `lokalise.i18n-ally`, `usernamehw.errorlens`, `eamodio.gitlens`, `streetsidesoftware.code-spell-checker`, `editorconfig.editorconfig`, `yoavbls.pretty-ts-errors`, `mobile-dev-inc.maestro-workspace` (verify the ID), `redhat.vscode-yaml`.
- **`launch.json`:** React Native attach/debug configs.
- **`tasks.json`:** run android/ios per env, pods, verify.
- **`tempo.code-snippets`:** `rncomp` (component skeleton matching the generator), `rnscreen`, `rnhook`, `rnquery`, `rnstore`, `rntest`.
- **Commit:** `chore(vscode): add workspace settings extensions and snippets`

---
