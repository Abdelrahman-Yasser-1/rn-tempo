---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS5 — CLI core (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `packages/cli/**`.

## Acceptance criteria
- **AC-1** in a fixture run with `--template ../../template --yes` and every feature off except the defaults, the output passes `yarn typecheck` (run in the CI job in WS14).

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS5 — CLI core (Wave 1)
**Owns:** `packages/cli/**`.

**5.1 Package skeleton**
- `package.json`: name `create-tempo-app`, bins `{ "create-tempo-app": "dist/create.mjs", "tempo": "dist/tempo.mjs" }`, `type: module`, `engines.node >= 22`, `files: ["dist", "templates"]`.
- Tooling: tsdown build, vitest, `src/commands/*`, `src/lib/*`.
- Every command supports `--yes` (defaults, no prompts), `--json` (machine output on stdout, logs on stderr) and `--cwd`.
- **Commit:** `feat(cli): scaffold cli package`

**5.2 lib modules** (each unit-tested against fixtures in `packages/cli/test/fixtures/`)

| Module | Responsibility |
|---|---|
| `markers.ts` | Strip or keep feature regions for each file type, using `@rn-tempo/contracts` markers. Validates balanced markers and throws on unbalanced ones, naming the file and line. |
| `manifest.ts` | Load and validate manifests; resolve `requires` and `conflicts`; produce a removal plan. |
| `remove-feature.ts` | Apply the plan: strip markers across text files, delete globs, remove deps from `package.json`, apply `jsonPatches`, remove env keys from `.env*`, then queue `postRemove` steps. |
| `rename.ts` | Replace identifiers across text files (skip binaries by extension list and a null-byte check). Replacement order matters — longest first: `com.rntempo.app` → new bundle ID; `com/rntempo/app` → new path; `TempoApp` → new identifier; `Tempo Dev`/`Tempo Stg`/`Tempo` display names → new ones; `tempo-dev`/`tempo-staging`/`tempo` schemes (only in xcconfig, gradle placeholders, `.env*`, and `.tempo.json`). It moves the Android source dirs, renames the iOS folders, files and schemes (`TempoApp*` paths), and updates `app.json` and `package.json` name. |
| `env.ts` | Read and write the env matrix in `.tempo.json`; generate Gradle flavor blocks with the same text the template uses, so the output stays identical; call `scripts/native/ios-envs.rb` via execa; create `.env.<name>` from `.env.example`; add package scripts. |
| `icons.ts` | Calls the project's `scripts/native/icons.mjs` with the env matrix. |
| `fetch-template.ts` | `giget("gh:Abdelrahman-Yasser-1/rn-tempo/template#v<version>")` with an override flag `--template <path|gh:...>` for local testing. |
| `pm.ts` | Run yarn/pods via execa with streaming output. |
| `tempo-json.ts` | Read and validate `.tempo.json`. |

- **Commits:** one per module, `feat(cli): add <module>`, plus `test(cli): …`.

**5.3 `create-tempo-app <name>`**
- **Prompts** (`@clack/prompts`):
  - app name (PascalCase, validated)
  - display name
  - base bundle ID (reverse-DNS validated)
  - envs (multiselect from dev/staging/prod, plus a "custom" text list)
  - per-env display name and suffix (with defaults)
  - modules (multiselect, preselected per `defaultEnabled`)
  - AI tools
  - git init (y/n)
  - install now (y/n)
- **Pipeline:** fetch → rename → remove unselected features → configure envs (if they differ from the default) → write `.tempo.json` → rewrite `portal:` deps to the published versions (`^<cli version's matching config versions>`) → `yarn install` → `bundle install && pod install` (macOS only) → `ai sync` (after WS12; until then skip) → `git init && git add -A && git commit -m "chore(repo): initialize from rn-tempo v<version>"` → print next steps.
- **Done when:** in a fixture run with `--template ../../template --yes` and every feature off except the defaults, the output passes `yarn typecheck` (run in the CI job in WS14).
- **Commit:** `feat(cli): add create command`

**5.4 `tempo` commands**
- `g feature|screen|component|hook|store|query` (5.5)
- `env add|list|remove`
- `icons`
- `rename`
- `feature add|remove` (`add` re-fetches the module's files from the template at the project's `templateVersion` and re-inserts them; if that's too complex for v1, implement `remove` only and make `add` print the docs link)
- `assets sync`
- `clean` (rm `node_modules/.cache`, `$TMPDIR/metro-*`, `watchman watch-del-all`, `ios/Pods`, `ios/build`, `android/.gradle`, `android/app/build`, `~/Library/Developer/Xcode/DerivedData/<App>-*`, each with a confirm unless `--yes`)
- `doctor` (5.6)
- **Commits:** one per command.

**5.5 Generators**
- Templates are plain files with `{{name}}`, `{{Name}}`, `{{feature}}`, `{{name_kebab}}` placeholders in `packages/cli/templates/<kind>/`.
- **Project overrides:** the project's `.tempo/templates/<kind>/` is used instead when present.
- `g feature <kebab>` creates:
  - the §C5 feature tree with `index.ts`, `api/keys.ts`, an example query, `screens/<Name>Screen` (screen + test + styles + index)
  - `src/locales/{en,ar}/<feature>.json`
  - `specs/<feature>/{spec,design,tasks}.md` from the spec templates (WS7)
  - It prints the follow-ups (register route, add scope to commitlint) and, with `--register`, auto-adds the route to the given stack using magicast/ts-morph.
- `g component <Name> [--feature x]` creates the component folder (shared → with story + test).
- `g screen <Name> --feature x [--stack Home]` creates the screen folder and appends the route to `navigation/types.ts`.
- `g hook`, `g store`, `g query` work similarly.
- **Generated output must pass `yarn verify` untouched** (snapshot tests plus the CI job).
- **Commits:** `feat(cli): add feature generator`, and so on.

**5.6 `doctor`**
- **Checks:**
  - node version vs `.nvmrc`
  - yarn version
  - Java 17+
  - Xcode (macOS)
  - CocoaPods/bundler
  - Android SDK env vars
  - `.env.<env>` present for each env in `.tempo.json`
  - `.tempo.json` is valid
  - config package versions vs the latest on npm (warn if > 1 minor behind)
  - template version vs latest (info)
  - `yarn lint:files` + the eslint structure rules (run only those rules)
- `--ci` prints a markdown report (for the PR comment) and exits non-zero only on errors.
- **Commit:** `feat(cli): add doctor command`

---
