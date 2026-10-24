# RN-TEMPO v2 — Detailed Implementation Plan (implementer-safe)

> **Audience:** this plan is executed by a *cheaper implementer model* and checked by a *stronger reviewer model*. Every decision is made here. **If something is not specified, the implementer must STOP and ask — never invent.**
>
> **Repo:** empty GitHub repo supplied by the owner → referred to as `Abdelrahman-Yasser-1/rn-tempo` (replace in WS0 task 0.1).
> **Date of version snapshot:** 2026-10-24.

---

## 0. Context

**Problem.** Each new project is set up by hand, and every codebase ends up shaped differently. As a result:
- Moving people between projects is slow.
- Standards drift.
- AI agents produce inconsistent code.

**Goal.** Build one opinionated, enforced, AI-ready React Native CLI baseline, with three parts:
1. **Template app.** RN 0.88 with multi-env native flavors and the full infrastructure listed in §3.
2. **Published CLI** (`create-tempo-app` + `tempo`). It creates projects with feature toggles, generates code, manages envs and icons, and checks drift.
3. **Fumadocs site.** It explains every file and line, plus recipes for the things deliberately left out of the template.

**Locked decisions:**

| Area | Choice |
|---|---|
| State | Zustand (client) + TanStack Query (server), plus a Redux Toolkit recipe in the docs |
| Styling | Unistyles 3 |
| CI/CD | GitHub Actions + Fastlane |
| Docs | Fumadocs |
| Scaffolding | Own CLI with feature toggles |
| Envs | `dev` / `staging` / `prod` |
| E2E | Maestro |
| Native modules | Pure RN CLI libraries, no Expo modules |
| Package versions | Latest compatible |
| AI tracking | Every AI change is tracked together with the prompts behind it |
| Specs | Spec-driven development |
| Commits | Small, reviewable commits |

**Sources mined for ideas:**
- `Abdelrahman-Yasser-1/RN-TEMPO`:
  - ESLint rule set
  - lefthook
  - Fumadocs with `llms.txt`
- `React-Native-Template-Docs`:
  - Folder structure draft
  - Docs for each lint rule
- `ejada-template/MobileTemplate-2026`:
  - HTTP client with refresh queue
  - Token cache over the keychain
  - SSL pinning that fails closed, plus a request gate
  - jail-monkey integrity check
  - Scaling helpers
  - Shimmers
  - Config-driven forms
  - Clean script

The ejada files are local at `/Users/ayasser/Personal/ejada-template/MobileTemplate-2026` and can be read for reference. **Do not copy their Redux code.**

---

## PART A — Rules for every agent (read before any task)

### A1. Implementer rules
1. **Scope.** Work only on the task ID you were given, and only touch files listed in that task, or in your workstream's "Owns" paths.
   - If you need a change elsewhere, stop and write a note in the PR under "Out-of-scope requests".
2. **Library APIs.** Never write a library API call from memory. Before using any library, query **context7** (`resolve-library-id` → `query-docs`) for the exact version in §B3. If the docs disagree with this plan's code, follow the docs and note it in the PR.
3. **Dependencies.**
   - Never add, remove or upgrade a dependency unless the task says so.
   - Versions are **exact pins** (no `^`/`~`) in `template/package.json`. Use `yarn add -E`.
4. **Commits.** Commit after each numbered step that leaves the repo green. Follow §C10.
   - Each commit should be ≤ ~200 changed lines, excluding lockfiles and generated native/asset files.
   - Before every commit, run `yarn verify:changed` inside `template/` once WS1 has landed; until then run `yarn lint && yarn typecheck`.
5. **Type safety.**
   - No `any`, no `@ts-ignore`, and no `eslint-disable` without a `-- reason` comment.
   - The reviewer rejects unexplained disables.
6. **UI text.** No hard-coded user-facing strings. Every UI string goes through i18n (§C11), in both `en` and `ar`.
7. **Styling.** No raw colors or sizes in styles. Use theme tokens (§C6) and the scaling helpers.
8. **Tests.** Every new util, hook, service, component or screen gets a test in the same commit or the next one.
9. **Comments.**
   - Explain *why*, not *what*.
   - Every exported function or component in `services/` and `shared/` gets a one-line JSDoc.
   - Use region markers for docs (§C7.3) where a task asks for them.
10. **Verification.** When done, run the task's "Done when" checks and paste the command outputs, trimmed, into the PR description.
11. **AI tracking.** Keep it on (§C9). Never edit or delete files in `.ai/sessions/` that another session created.

### A2. Reviewer protocol (strong model)
For every PR:
1. Read the task(s) in this plan and the PR diff.
2. Run the checks:
   - `yarn install --immutable && yarn verify`
   - The task's "Done when" commands
   - For native changes: build both platforms for the touched env(s)
3. Apply the **general checklist** (§E1) and the **workstream checklist** (§E2).
4. Leave line comments. Ask for changes as **new fixup commits** (`git commit --fixup <sha>`); the implementer then runs `git rebase -i --autosquash` before merge.
5. Approve only when every checklist item passes.
6. Merge with **"Rebase and merge"** (squash merging is disabled) so the small commits are preserved on `main`.

### A3. Git workflow
- Branches: `ws<N>/<task-id>-<slug>`, e.g. `ws3/3.4-http-client`. Each branch comes from up-to-date `main`.
- Use one **git worktree** per parallel agent: `git worktree add ../rn-tempo-ws3 -b ws3/3.4-http-client main`.
- PR title = Conventional Commit header. PR body uses the template in §C10.4.
- `main` protection:
  - Requires CI to pass and 1 approval.
  - Linear history.
  - Rebase merge only.

---

## PART B — Fixed names and versions

### B1. Naming constants (placeholders that the CLI renames)

| Constant | Value | Used for |
|---|---|---|
| App identifier | `TempoApp` | iOS project, target, folder; RN app name in `app.json` |
| Display title | `Tempo` | Prod display name |
| Base bundle ID / Android namespace | `com.rntempo.app` | Prod bundle ID, Android `namespace`, Kotlin package `com.rntempo.app` (dir `com/rntempo/app`) |
| npm scope | `@rn-tempo` | Config packages |
| CLI package | `create-tempo-app` | Bins: `create-tempo-app`, `tempo` |
| Docs site name | `RN Tempo Docs` | |

### B2. Environment matrix — the single source of truth

| Key | dev | staging | prod |
|---|---|---|---|
| `APP_ENV` value | `dev` | `staging` | `prod` |
| Android flavor | `dev` | `staging` | `prod` |
| Android variants | `devDebug`, `devRelease` | `stagingDebug`, `stagingRelease` | `prodDebug`, `prodRelease` |
| `applicationIdSuffix` | `.dev` | `.staging` | *(none)* |
| Bundle ID | `com.rntempo.app.dev` | `com.rntempo.app.staging` | `com.rntempo.app` |
| Display name | `Tempo Dev` | `Tempo Stg` | `Tempo` |
| iOS build configs | `Debug-Dev`, `Release-Dev` | `Debug-Staging`, `Release-Staging` | `Debug-Prod`, `Release-Prod` |
| iOS scheme | `TempoApp-Dev` | `TempoApp-Staging` | `TempoApp-Prod` |
| iOS xcconfig | `ios/Config/Dev.xcconfig` | `ios/Config/Staging.xcconfig` | `ios/Config/Prod.xcconfig` |
| iOS AppIcon set | `AppIcon-Dev` | `AppIcon-Staging` | `AppIcon` |
| Env file | `.env.dev` | `.env.staging` | `.env.prod` |
| URL scheme | `tempo-dev` | `tempo-staging` | `tempo` |
| Icon badge | `DEV` (orange `#F97316`) | `STG` (purple `#8B5CF6`) | none |
| Run scripts | `android:dev`, `ios:dev`, `start:dev` | `android:staging`, `ios:staging`, `start:staging` | `android:prod`, `ios:prod`, `start:prod` |

### B3. Exact versions (pin these; re-check with `npm view <pkg> version` in WS0 task 0.5 and bump if newer)

**Runtime**

| Package | Version |
|---|---|
| node (`.nvmrc`) | `26` if `https://nodejs.org/dist/index.json` marks v26 as LTS at WS0 start; otherwise `24` |
| yarn | 4.18.1 (`packageManager: "yarn@4.18.1"`) |
| react-native | 0.88.0 |
| react | 19.3.1 |
| @react-native-community/cli (+ cli-platform-android, cli-platform-ios) | 20.2.0 |
| @react-native/babel-preset, metro-config, typescript-config | 0.88.0 |

**Template app dependencies**

| Package | Version |
|---|---|
| @react-navigation/native | 7.5.1 |
| @react-navigation/native-stack | 7.21.0 |
| @react-navigation/bottom-tabs | 7.21.0 |
| react-native-screens | 4.30.0 |
| react-native-safe-area-context | 5.10.1 |
| @tanstack/react-query | 5.104.5 |
| zustand | 5.0.16 |
| axios | 1.20.0 |
| zod | 4.6.7 |
| react-hook-form | 7.90.0 |
| @hookform/resolvers | 6.0.0 |
| react-native-unistyles | 3.6.0 |
| react-native-nitro-modules | 0.37.1 |
| react-native-edge-to-edge | latest (Unistyles peer; check with npm) |
| react-native-mmkv | 4.3.2 |
| react-native-keychain | 10.0.0 |
| react-native-config | 1.7.2 |
| react-native-ssl-public-key-pinning | 1.2.6 |
| jail-monkey | 3.0.0 |
| react-native-bootsplash | 7.3.4 |
| react-native-reanimated | 4.7.1 |
| react-native-worklets | 0.13.0 |
| react-native-gesture-handler | 3.4.0 |
| @gorhom/bottom-sheet | 5.2.14 |
| @shopify/flash-list | 2.3.3 |
| react-native-svg | 15.16.0 |
| @d11/react-native-fast-image | 8.13.0 |
| react-native-fast-shimmer | 1.3.5 |
| i18next | 26.5.7 |
| react-i18next | 17.1.5 |
| react-native-localize | 3.7.2 |
| react-native-restart | 0.0.29 |
| @react-native-community/netinfo | 12.0.1 |
| react-native-toast-message | latest |

**Template dev dependencies**

| Package | Version |
|---|---|
| react-native-svg-transformer | 1.5.3 |
| babel-plugin-module-resolver | latest |
| typescript | **6.0.x latest patch** (NOT 7, see ADR-004) |
| @types/react | latest 19.x |
| jest | 30.5.2 |
| @testing-library/react-native | 14.1.0 |
| msw | 3.0.3 |
| react-native-url-polyfill | latest |
| fast-text-encoding | latest |
| @storybook/react-native | 10.7.0 |
| storybook | 10.6.3 |
| @storybook/addon-ondevice-controls | matching 10.x |
| @storybook/addon-ondevice-actions | matching 10.x |
| rozenite (+ @rozenite/tanstack-query-plugin, @rozenite/mmkv-plugin, @rozenite/network-activity-plugin) | 2.5.0 / 2.1.0 / 2.5.0 |

**Lint and quality tooling**

| Package | Version |
|---|---|
| eslint | 10.13.0 |
| typescript-eslint | 8.72.0 |
| @eslint-react/eslint-plugin | 5.28.8 |
| eslint-plugin-react-hooks | 7.1.1 |
| eslint-plugin-boundaries | 7.3.0 |
| eslint-plugin-project-structure | 3.14.5 |
| eslint-plugin-sonarjs | 4.2.2 |
| eslint-plugin-unicorn | 79.0.0 |
| @tanstack/eslint-plugin-query | 5.104.5 |
| eslint-plugin-testing-library | 7.16.2 |
| eslint-plugin-jest | latest |
| eslint-plugin-i18next | 6.1.5 |
| eslint-plugin-react-native-a11y | 3.5.1 (wrap with `@eslint/compat` `fixupPluginRules`) |
| eslint-plugin-import-x | latest |
| eslint-plugin-promise | latest |
| eslint-plugin-regexp | latest |
| eslint-plugin-jsdoc | latest |
| eslint-plugin-no-secrets | latest |
| eslint-plugin-react-native | latest (compat-wrapped if needed) |
| eslint-config-prettier | 10.1.8 |
| prettier | 3.9.10 |
| @ls-lint/ls-lint | 2.3.2 |
| knip | 6.42.1 |
| i18next-cli | 1.80.0 |
| lefthook | 2.2.2 |
| @commitlint/cli, @commitlint/config-conventional | 21.2.4 |
| danger | 14.0.7 |
| gitleaks | system binary in CI (gitleaks/gitleaks-action) |

**Monorepo packages, CLI and docs**

| Package | Version |
|---|---|
| @changesets/cli | 3.0.3 |
| citty | 0.2.2 |
| @clack/prompts | 1.8.1 |
| giget | 3.3.1 |
| execa | latest |
| magicast | latest |
| sharp | 0.35.5 |
| tsdown | 0.23.2 |
| vitest | 5.0.5 |
| fumadocs-core, fumadocs-ui | 16.17.8 |
| fumadocs-mdx | 15.4.10 |
| next | 16.4.3 |

**Exceptions to "latest" (each one gets an ADR):**
- **TypeScript 6.0 instead of 7.** typescript-eslint peer `<6.1.0`.
- **No `@react-native/eslint-config`.** Its peer dependency stops at ESLint 9.
- **a11y plugin compat-wrapped.** Its peer dependency stops at ESLint 8.

---

## PART C — Contracts (exact; WS0 commits these; nobody changes them without the integrator)

### C1. Monorepo layout
```
<REPO>/
├── template/                     # RN app (own yarn.lock; NOT a workspace)
├── packages/
│   ├── cli/                      # create-tempo-app
│   ├── eslint-config/            # @rn-tempo/eslint-config
│   ├── prettier-config/          # @rn-tempo/prettier-config
│   ├── commitlint-config/        # @rn-tempo/commitlint-config
│   ├── tsconfig/                 # @rn-tempo/tsconfig
│   └── contracts/                # @rn-tempo/contracts (JSON schemas + TS types)
├── docs/                         # Fumadocs (workspace)
├── specs/                        # specs for building the template itself (one folder per WS)
├── .ai/sessions/                 # AI session logs for THIS repo
├── .claude/ .cursor/ .github/    # AI + CI for THIS repo
├── AGENTS.md  CLAUDE.md  VERSIONS.md  README.md  LICENSE (MIT)
├── .changeset/  lefthook.yml  commitlint.config.mjs  .nvmrc  .yarnrc.yml  package.json
```
ADR locations:
- **Template repo:** `docs/content/docs/adr/NNN-title.mdx`, rendered by the docs site. Before WS6 lands they live temporarily in `specs/adr/`.
- **Generated projects:** plain markdown in `docs/adr/`.

Root `package.json`:
```json
{
  "name": "rn-tempo",
  "private": true,
  "packageManager": "yarn@4.18.1",
  "workspaces": ["packages/*", "docs"],
  "scripts": {
    "prepare": "lefthook install",
    "lint": "yarn workspaces foreach -A run lint",
    "test": "yarn workspaces foreach -A run test",
    "typecheck": "yarn workspaces foreach -A run typecheck",
    "changeset": "changeset",
    "release": "changeset publish"
  }
}
```
`.yarnrc.yml`: `nodeLinker: node-modules` and `enableGlobalCache: true`.

The template has its own `.yarnrc.yml` with the same settings, plus its own `packageManager`. During template development it consumes the config packages through `"@rn-tempo/eslint-config": "portal:../packages/eslint-config"` (and likewise for the others). The CLI rewrites these to published versions in generated projects.

### C2. Template root files (after all workstreams)
```
template/
├── android/  ios/  e2e/flows/  fastlane/  scripts/  specs/  ai/  .ai/sessions/
├── src/  __mocks__/  .rnstorybook/
├── .env.example  .env.dev  .env.staging  .env.prod   # .env.* except .example are gitignored; WS0 commits only .env.example
├── .tempo.json  AGENTS.md  CLAUDE.md  PROJECT.md  README.md
├── app.json  index.js  babel.config.js  metro.config.js  react-native.config.js
├── tsconfig.json  eslint.config.mjs  prettier.config.mjs  commitlint.config.mjs
├── .ls-lint.yml  knip.json  i18next.config.ts  jest.config.js  jest.setup.ts
├── lefthook.yml  Dangerfile.ts  renovate.json  Gemfile
├── .vscode/  .claude/  .cursor/  .github/  .nvmrc  .yarnrc.yml  .editorconfig  .gitattributes  .gitignore
```

### C3. `src/config/env.ts` (exact)
```ts
import Config from 'react-native-config';
import { z } from 'zod';

// Single source of truth for env vars. Import `ENV`, never `react-native-config` (lint-enforced).
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'staging', 'prod']),
    API_BASE_URL: z.url(),
    API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    API_MOCKING: bool.default(false),
    SSL_PINNING_ENABLED: bool.default(false),
    SSL_PINS: z
      .string()
      .default('')
      .transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean)),
    DEVICE_INTEGRITY_ENABLED: bool.default(false),
    STORYBOOK_ENABLED: bool.default(false),
    DEEP_LINK_SCHEME: z.string().min(1),
    DEEP_LINK_HOST: z.string().default(''),
    APP_CONFIG_PATH: z.string().default('/app-config'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.SSL_PINNING_ENABLED && env.SSL_PINS.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['SSL_PINS'], message: 'At least 2 pins required when SSL_PINNING_ENABLED=true' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(Config);
if (!parsed.success) {
  // Fail fast: a misconfigured build must never reach users.
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const ENV: Env = parsed.data;
export const isDev = ENV.APP_ENV === 'dev';
export const isStaging = ENV.APP_ENV === 'staging';
export const isProd = ENV.APP_ENV === 'prod';
```

`.env.example` (committed; WS2 creates `.env.dev`, `.env.staging` and `.env.prod` locally from it, and CI writes them from secrets):
```
APP_ENV=dev
API_BASE_URL=https://dummyjson.com
API_TIMEOUT_MS=15000
API_MOCKING=true
SSL_PINNING_ENABLED=false
SSL_PINS=
DEVICE_INTEGRITY_ENABLED=false
STORYBOOK_ENABLED=false
DEEP_LINK_SCHEME=tempo-dev
DEEP_LINK_HOST=
APP_CONFIG_PATH=/app-config
LOG_LEVEL=debug
```
**Exception to "only `.env.example` is committed":** `.env.dev` IS committed. It holds no secrets, and committing it means a fresh clone runs. `.env.staging` and `.env.prod` stay gitignored. Add a comment at the top of `.env.dev` saying it must never contain secrets.

### C4. Path aliases (exact; identical in `tsconfig.json` paths and `babel-plugin-module-resolver`)
| Alias | Path |
|---|---|
| `@app/*` | `src/app/*` |
| `@navigation/*` | `src/navigation/*` |
| `@features/*` | `src/features/*` |
| `@shared/*` | `src/shared/*` |
| `@services/*` | `src/services/*` |
| `@theme/*` | `src/theme/*` |
| `@assets/*` | `src/assets/*` |
| `@locales/*` | `src/locales/*` |
| `@config/*` | `src/config/*` |
| `@test-utils/*` | `src/test-utils/*` |

**Barrels:** a barrel (`index.ts`) is allowed only at:
- each feature root
- each component/screen folder
- `src/shared/components/index.ts`
- `src/shared/hooks/index.ts`
- `src/shared/utils/index.ts`
- `src/theme/index.ts`
- `src/assets/*/index.ts`

### C5. Folder skeleton and naming rules
```
src/
├── app/
│   ├── App.tsx                    # root component
│   ├── providers/AppProviders.tsx # composition order fixed in task 3.12
│   ├── bootstrap/                 # useBootstrap.ts + steps: initSecurity.ts, initAuth.ts, initRemoteConfig.ts, initI18n.ts
│   └── screens/                   # app-level screens: ForceUpdateScreen, MaintenanceScreen, NotFoundScreen, DebugMenuScreen
├── navigation/  RootNavigator.tsx  AuthNavigator.tsx  MainTabs.tsx  linking.ts  types.ts  navigationRef.ts  useIsSignedIn.ts
├── features/<kebab-name>/
│   ├── api/        <name>.api.ts  queries.ts  mutations.ts  keys.ts  schemas.ts
│   ├── components/<PascalName>/{PascalName.tsx, index.ts, styles.ts?, types.ts?, PascalName.test.tsx?}
│   ├── hooks/      use<Name>.ts  use<Name>.test.ts
│   ├── screens/<Name>Screen/{<Name>Screen.tsx, <Name>Screen.test.tsx, styles.ts, index.ts}
│   ├── store/      <name>.store.ts  <name>.store.test.ts
│   ├── types/      index.ts
│   ├── utils/      <camel>.ts  <camel>.test.ts
│   ├── constants.ts
│   └── index.ts    # public API
├── shared/
│   ├── components/<PascalName>/{PascalName.tsx, PascalName.test.tsx, PascalName.stories.tsx, styles.ts, types.ts, index.ts}
│   ├── hooks/      use<Name>.ts + use<Name>.test.ts
│   ├── utils/      <camel>.ts + <camel>.test.ts     # PURE: may import only shared/utils, shared/types, shared/constants, config
│   ├── constants/  <camel>.ts
│   └── types/      <camel>.ts
├── services/<kebab>/  # http, storage, secure-storage, security, flags, remote-config, logger, i18n, linking, toast
├── theme/      tokens.ts  themes.ts  breakpoints.ts  unistyles.ts  scaling.ts  index.ts
├── assets/     fonts/ images/ icons/ animations/ (each: index.ts generated by `tempo assets sync`)
├── locales/    en/<ns>.json  ar/<ns>.json
├── config/     env.ts  constants.ts
└── test-utils/ renderWithProviders.tsx  msw/{server.ts, handlers/<domain>.ts, db.ts}  factories/<entity>.ts
```

**Naming:**
- Directories: kebab-case. Component and screen directories: PascalCase.
- `.tsx` files: PascalCase.
- `.ts` files: camelCase. Hooks are `useX.ts`. Stores are `x.store.ts`. API files are `x.api.ts`.
- Booleans start with `is`, `has`, `should`, `can`, `did`, `will`, `show`, `hide`, `was`, `could`, `needs`, `allows`, `wants` or `requires`.
- Constants: UPPER_CASE. Types, interfaces and components: PascalCase. Enums are forbidden; use `as const` objects plus union types.

### C6. Theme contract (`src/theme/tokens.ts` — exact shape; values set in task 3.2)
```ts
export type ColorTokens = {
  primary: string; onPrimary: string; primaryContainer: string; onPrimaryContainer: string;
  secondary: string; onSecondary: string;
  background: string; onBackground: string;
  surface: string; onSurface: string; surfaceVariant: string; onSurfaceVariant: string;
  textPrimary: string; textSecondary: string; textDisabled: string; textInverse: string;
  border: string; divider: string; focus: string;
  success: string; onSuccess: string; warning: string; onWarning: string;
  error: string; onError: string; info: string; onInfo: string;
  overlay: string; skeletonBase: string; skeletonHighlight: string;
};
export type SpacingKey = 'none' | 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';
export const spacing: Record<SpacingKey, number> = { none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export type RadiusKey = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export const radii: Record<RadiusKey, number> = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
export type TypographyVariant = 'display' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'bodyStrong' | 'bodySmall' | 'label' | 'caption' | 'button';
export type TypographyStyle = { fontFamily: string; fontSize: number; lineHeight: number; fontWeight: '400' | '500' | '600' | '700'; letterSpacing: number };
export type ShadowKey = 'none' | 'sm' | 'md' | 'lg';
export type ZIndexKey = 'base' | 'dropdown' | 'sticky' | 'modal' | 'toast';
export type AppTheme = {
  name: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: Record<TypographyVariant, TypographyStyle>;
  shadows: Record<ShadowKey, { boxShadow: string }>; // RN 0.76+ boxShadow string
  zIndex: Record<ZIndexKey, number>;
};
export const breakpoints = { xs: 0, sm: 360, md: 600, lg: 900, xl: 1200 } as const;
```

**Scaling helpers** (`src/theme/scaling.ts`, ported from ejada):
- The base design is 390×844.
- `px` and `pxH` scale and clamp at 1.2.
- `fontPx` clamps at 1.15.
- `pxM(size, factor = 0.5)` scales moderately, partway between the raw value and `px(size)`.

**Font scaling cap:** the `Text` component sets `maxFontSizeMultiplier = 1.5` by default.

### C7. Feature toggles

**C7.1 Module names** (exact; used everywhere):

| Module | Default | Description |
|---|---|---|
| `ssl-pinning` | on | SPKI pinning + request gate |
| `device-integrity` | on | jail-monkey check (prod only) |
| `storybook` | on | On-device Storybook (dev flavor) |
| `dynamic-forms` | off | Config-driven multi-step forms (`src/features/dynamic-forms`) |
| `samples` | on | `items` reference feature (list/detail/create) |
| `maestro` | on | `e2e/` + e2e workflow |
| `ci-github` | on | `.github/workflows` + `fastlane/` |
| `ai-claude` | on | `.claude/` + `CLAUDE.md` |
| `ai-cursor` | on | `.cursor/` |
| `ai-copilot` | on | `.github/copilot-instructions.md` + `.github/instructions/` |

The template repo keeps **every** module present, `dynamic-forms` included. "Default" only sets the CLI prompt's preselection.

**C7.2 Marker syntax.** Removing a module deletes everything from the start line through the end line, inclusive. Markers stay in place when a module is kept.

| File type | Start | End | Single line |
|---|---|---|---|
| ts/tsx/js/kt/swift/gradle | `// @tempo-feature:<name>:start` | `// @tempo-feature:<name>:end` | line ends with `// @tempo-feature:<name>` |
| JSX children | `{/* @tempo-feature:<name>:start */}` | `{/* @tempo-feature:<name>:end */}` | — |
| xml/plist/storyboard | `<!-- @tempo-feature:<name>:start -->` | `<!-- @tempo-feature:<name>:end -->` | — |
| rb/yml/yaml/.env/sh/Podfile | `# @tempo-feature:<name>:start` | `# @tempo-feature:<name>:end` | line ends with `# @tempo-feature:<name>` |
| json | not allowed — use manifest `jsonPatches` | | |

**C7.3 Docs region markers:** `// #region <name>` … `// #endregion <name>`, or the comment syntax of each file type. These are used by the docs to include code (WS13). They are separate from the feature markers.

**C7.4 Manifest:** every module has a manifest at `template/.tempo/features/<name>.json`, validated by `packages/contracts/schemas/feature-manifest.schema.json`:
```json
{
  "$schema": "../../node_modules/@rn-tempo/contracts/schemas/feature-manifest.schema.json",
  "name": "ssl-pinning",
  "title": "SSL public-key pinning",
  "description": "SPKI pinning via react-native-ssl-public-key-pinning, fails closed in prod.",
  "defaultEnabled": true,
  "requires": [],
  "conflicts": [],
  "deleteGlobs": ["src/services/security/pinning/**"],
  "dependencies": ["react-native-ssl-public-key-pinning"],
  "devDependencies": [],
  "envKeys": ["SSL_PINNING_ENABLED", "SSL_PINS"],
  "jsonPatches": [],
  "postRemove": ["pods"],
  "docs": "/docs/features/ssl-pinning"
}
```

Field rules:
- `postRemove` allowed values: `"pods"` and `"assets-sync"`.
- `jsonPatches` items have the shape `{ "file": "package.json", "op": "remove", "path": "/scripts/storybook" }`, following RFC 6902 `remove` only.

### C8. `.tempo.json` (generated project metadata; schema at `packages/contracts/schemas/tempo.schema.json`)
```json
{
  "$schema": "https://unpkg.com/@rn-tempo/contracts/schemas/tempo.schema.json",
  "templateVersion": "1.0.0",
  "createdWith": "create-tempo-app@1.0.0",
  "app": { "name": "TempoApp", "displayName": "Tempo", "bundleId": "com.rntempo.app" },
  "envs": [
    { "name": "dev", "suffix": ".dev", "displayName": "Tempo Dev", "scheme": "tempo-dev", "badge": "DEV" },
    { "name": "staging", "suffix": ".staging", "displayName": "Tempo Stg", "scheme": "tempo-staging", "badge": "STG" },
    { "name": "prod", "suffix": "", "displayName": "Tempo", "scheme": "tempo", "badge": null }
  ],
  "features": ["ssl-pinning", "device-integrity", "storybook", "samples", "maestro", "ci-github", "ai-claude", "ai-cursor", "ai-copilot"],
  "ai": { "tools": ["claude", "cursor", "copilot"], "logPrompts": "full" }
}
```
`ai.logPrompts` accepts `"full"`, `"summary"` or `"off"`.

### C9. AI session tracking contract

**Files:**
- `.ai/sessions/<YYYY-MM-DD>-<HHmm>-<tool>-<shortid>.md`: committed.
- `.ai/.current.json`: gitignored. Holds the active session pointer: `{ "file": ".ai/sessions/…md", "sessionId": "…", "tool": "claude-code", "model": "…", "startSha": "<HEAD at start>", "startedAt": "ISO" }`.
- `.ai/redact.json`: committed; extra regex patterns. Default `{ "patterns": [] }`.

**Session file format:**
```markdown
---
id: 2026-10-24-2115-claude-code-ab12cd
tool: claude-code            # claude-code | cursor | copilot | other
model: claude-sonnet-5-5
author: Jane Doe <jane@x.com> # from git config
branch: ws3/3.4-http-client
spec: specs/ws3-core-infra    # or null
started: 2026-10-24T21:15:03Z
ended: 2026-10-24T22:02:41Z   # updated on each Stop
commits: [3f2a1b9, 9c0d7e2]   # startSha..HEAD, short SHAs
files: [template/src/services/http/client.ts]
---

## Prompts
### 1 · 2026-10-24T21:15:03Z
<verbatim prompt, redacted>

## Summary
<last assistant message, truncated to 2000 chars — replaced on each Stop>

## Follow-ups
- <free text, optional>
```

**Commit trailers.** `prepare-commit-msg` adds these when `.ai/.current.json` exists, is less than 12h old, and the env var `AI_TRACKING` is not `off`:
```
AI-Assisted: claude-code/claude-sonnet-5-5
AI-Session: .ai/sessions/2026-10-24-2115-claude-code-ab12cd.md
Spec: specs/ws3-core-infra
```
- `Spec:` is added only when the frontmatter `spec` is non-null.
- A commitlint rule `ai-session-trailer` rejects `AI-Assisted` without a matching `AI-Session` path, and also rejects an `AI-Session` path that does not exist in the commit tree or the index.

**Scripts** in `scripts/ai-log/`: Node ESM, **no dependencies**, Node ≥ 22.

| Script | Trigger | Behavior |
|---|---|---|
| `session-start.mjs` | Claude `SessionStart` hook; or `yarn ai:start --tool <t> --model <m> [--spec <path>]` | Creates the session file and writes `.current.json` (startSha = `git rev-parse HEAD`). If `.current.json` already exists with the same `sessionId`, reuses it (resume). |
| `prompt.mjs` | Claude `UserPromptSubmit` hook (JSON on stdin: `{session_id, prompt, cwd, transcript_path}`); or `yarn ai:prompt "<text>"` | Redacts, then appends `### n · ts` + prompt. Honors `logPrompts`: `summary` → writes only the first 140 chars + "…"; `off` → writes `(prompt not logged)`. |
| `session-stop.mjs` | Claude `Stop` hook (stdin `{session_id, transcript_path}`); or `yarn ai:stop --summary "<text>"` | Updates `ended`, `commits` (`git log startSha..HEAD --format=%h`) and `files` (`git diff --name-only startSha` ∪ `git status --porcelain` paths). Replaces `## Summary` with the last assistant text from the transcript JSONL, or `--summary`. |
| `add-trailers.mjs` | lefthook `prepare-commit-msg` `{1} {2}` | Skips when `{2}` is `merge` or `squash`, or when the trailers already exist. Appends the trailers via `git interpret-trailers --in-place`. |
| `stage-session.mjs` | lefthook `pre-commit` | `git add <current session file>` so the log travels with the commit. |
| `redact.mjs` | imported by the others | Masks: JWT `eyJ[\w-]+\.[\w-]+\.[\w-]+`; `Bearer\s+\S+`; AWS `AKIA[0-9A-Z]{16}`; `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END`; `(password\|passwd\|secret\|token\|api[_-]?key)\s*[:=]\s*\S+`; emails; plus `.ai/redact.json` patterns → replaced with `[REDACTED]`. |
| `report.mjs` | `yarn ai:report [--since 30d]` | Counts AI-assisted commits by tool, model and author from trailers; prints a table. |

**Claude hooks** (`.claude/settings.json`, same in the repo root and the template):
```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node scripts/ai-log/session-start.mjs --tool claude-code" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node scripts/ai-log/prompt.mjs" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node scripts/ai-log/session-stop.mjs" }] }],
    "PostToolUse": [{ "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "node scripts/ai-log/lint-edited.mjs" }] }]
  }
}
```
- The model for Claude comes from the `ANTHROPIC_MODEL` env var if set, otherwise the `model` field in the hook's stdin JSON if present, otherwise `unknown`. The implementer must verify the hook stdin fields in the Claude Code hooks docs, using the claude-code-guide agent or the docs.
- In the template repo root, commands point to `template/scripts/ai-log/*.mjs`.
- `lint-edited.mjs` runs `eslint --fix` + `prettier --write` on the edited file (path from stdin `tool_input.file_path`) and always exits 0.

### C10. Commits and PRs

**C10.1** Conventional Commits, enforced by `@rn-tempo/commitlint-config`:
- Types: `feat fix docs style refactor perf test build ci chore revert`.
- Header ≤ 100 chars, imperative, lowercase subject, no trailing period.

**C10.2 Scopes** (`scope-enum`, error level). The scope is required.
- Repo-level: `repo template packages cli contracts eslint-config prettier-config commitlint-config tsconfig docs specs ai ci release deps`
- App infra: `native android ios env app navigation theme i18n http storage security flags remote-config logger`
- Shared code: `ui hooks utils`
- Features: `auth home profile settings items onboarding forms`
- Tooling: `e2e test storybook fastlane vscode`

Generated projects extend this list with their own feature names via `commitlint.config.mjs`.

**C10.3 Commit size:**
- One logical change per commit.
- Dependency changes go in a separate commit with the `deps` scope.
- No refactor and feature in the same commit.
- Generated native files (Pods, icon PNGs, lockfiles) go in their own commit, labelled `chore(<scope>): regenerate …`.

**C10.4 PR body template** (`.github/pull_request_template.md`):
```markdown
## What & why
## Plan task(s)
- [ ] <task id> …
## Spec
specs/<…> (AC IDs covered: AC-1, AC-2)
## AI assistance
- [ ] AI-assisted — sessions: .ai/sessions/…
## Verification
<commands + trimmed output; screenshots/recordings for UI on iOS + Android, light + dark, en + ar>
## Out-of-scope requests
## Checklist
- [ ] yarn verify passes  - [ ] tests added  - [ ] i18n en+ar  - [ ] a11y props  - [ ] docs page updated/added
```

### C11. i18n contract
- Namespaces = one JSON file per namespace per language, at `src/locales/<lang>/<ns>.json`.
- Initial namespaces: `common`, `errors`, `validation`, `auth`, `home`, `profile`, `settings`, `items`, `app` (force-update, maintenance, not-found, debug, offline).
- Key format: nested camelCase, e.g. `auth.login.submitButton`. In code: `t('login.submitButton', { ns: 'auth' })`, or `useTranslation('auth')`.
- Types: `src/services/i18n/i18next.d.ts` declares `CustomTypeOptions` with `resources` typeof `en`, so a missing key is a type error.
- Languages: `en` (default/fallback) and `ar` (RTL). Both files must have identical key sets; `i18next-cli` enforces this in CI.
- Language persisted in MMKV key `app.language`. On first launch, use the device locale if supported, otherwise `en`.
- Changing between LTR and RTL: `I18nManager.allowRTL(true)` + `I18nManager.forceRTL(isRTL)`, then `RNRestart.restart()`, after a confirmation dialog.

### C12. Navigation contract (React Navigation 7, **static API**)
```ts
// src/navigation/types.ts — exact route names & params
export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Otp: { target: string; purpose: 'register' | 'reset-password' };
};
export type HomeStackParamList = {
  Home: undefined;
  ItemsList: undefined;            // @tempo-feature:samples
  ItemDetails: { itemId: number }; // @tempo-feature:samples
  ItemCreate: undefined;           // @tempo-feature:samples
};
export type ProfileStackParamList = { Profile: undefined; EditProfile: undefined };
export type SettingsStackParamList = { Settings: undefined; Language: undefined; Theme: undefined; About: undefined };
export type MainTabsParamList = { HomeTab: undefined; ProfileTab: undefined; SettingsTab: undefined };
export type RootStackParamList = {
  Auth: undefined; Main: undefined;
  ForceUpdate: undefined; Maintenance: undefined; NotFound: undefined;
  DebugMenu: undefined; // non-prod only
};
```

Deep link paths:
- Prefixes: `${ENV.DEEP_LINK_SCHEME}://`, plus `https://${ENV.DEEP_LINK_HOST}` when the host is non-empty.

| Path | Screen | Notes |
|---|---|---|
| `onboarding` | Onboarding | |
| `login` | Login | |
| `register` | Register | |
| `forgot-password` | ForgotPassword | |
| `otp` | Otp | params `target`, `purpose` |
| `home` | Home | |
| `items` | ItemsList | |
| `items/new` | ItemCreate | |
| `items/:itemId` | ItemDetails | `itemId` parsed as number |
| `profile` | Profile | |
| `profile/edit` | EditProfile | |
| `settings` | Settings | |
| `settings/language` | Language | |
| `settings/theme` | Theme | |
| `settings/about` | About | |
| `debug` | DebugMenu | non-prod only |
| `*` | NotFound | |

- A protected deep link opened while signed out goes to Login, then resumes the original link after login (`pendingLink` in the auth store).
- The auth gate uses `useIsSignedIn()` / `useIsSignedOut()` hooks backed by `authStore.status === 'signedIn'`.

### C13. API contract (dummyjson-compatible; MSW mocks the same shapes)

| Method & path | Request | Response | Real dummyjson? |
|---|---|---|---|
| POST `/auth/login` | `{username, password, expiresInMins?: number}` | `User & {accessToken, refreshToken}` | yes |
| POST `/auth/refresh` | `{refreshToken, expiresInMins?}` | `{accessToken, refreshToken}` | yes |
| GET `/auth/me` | Bearer | `User` | yes |
| POST `/users/add` | `{firstName, lastName, username, email, password}` | `User` | yes (non-persistent) |
| PUT `/users/:id` | `Partial<User>` | `User` | yes |
| POST `/auth/forgot-password` | `{email}` | `{success: true}` | **mock only** |
| POST `/auth/otp/verify` | `{target, code, purpose}` | `{success: boolean}`; code `123456` succeeds | **mock only** |
| POST `/auth/otp/resend` | `{target, purpose}` | `{success: true, retryAfterSec: 60}` | **mock only** |
| GET `/products?limit=&skip=` | — | `{products: Item[], total, skip, limit}` | yes |
| GET `/products/:id` | — | `Item` | yes |
| POST `/products/add` | `{title, price, description, category}` | `Item` | yes |
| GET `/app-config` | — | `AppConfig` (below) | **mock only**; on 404 or error, use local defaults and never block startup |

Types:
- `User = {id:number, username, email, firstName, lastName, gender, image}`
- `Item = {id:number, title, description, price:number, category, thumbnail, rating:number, stock:number}`
- `AppConfig = {minSupportedVersion:{ios:string, android:string}, latestVersion:{ios:string, android:string}, maintenance:{enabled:boolean, message?:string}, flags: Record<FlagKey, boolean>, storeUrls:{ios:string, android:string}}`

Mock credentials: username `emilys`, password `emilyspass` (the real dummyjson user). The login screen shows them as a hint in dev only.

### C14. testID convention
- Screen root: `<screen-kebab>-screen`, e.g. `login-screen`.
- Elements: `<screen-kebab>.<element-kebab>`, e.g. `login.username-input`, `login.submit-button`, `items-list.item-0`.
- Shared components accept a `testID` prop and pass it down; inner parts get suffixes such as `${testID}.label` and `${testID}.error`.

### C15. Storage keys and flags
- **MMKV instance:** `app-storage`, encrypted.
- **MMKV encryption key:**
  - Created on first launch: 32 random bytes, hex encoded.
  - Generated with `crypto.getRandomValues`, which RN 0.88 supports on Hermes. If unavailable, add `react-native-get-random-values`; stop and ask before adding it.
  - Stored in keychain service `<bundleId>.mmkv-key`.
- **MMKV keys:** `app.theme` (`light|dark|system`), `app.language` (`en|ar`), `app.onboarding-completed`, `app.api-base-url-override` (non-prod only), `zustand.<store-name>`.
- **Keychain:** service `<bundleId>.auth-tokens` with `accessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- **Flags:** defined in `src/services/flags/flags.ts`:
  ```ts
  export const FLAG_DEFAULTS = { onboardingEnabled: true, itemsCreateEnabled: true, biometricLoginEnabled: false } as const;
  export type FlagKey = keyof typeof FLAG_DEFAULTS;
  ```
- **Flag resolution order:** debug-menu local override (non-prod) → `AppConfig.flags` → `FLAG_DEFAULTS`.

### C16. Specs format (generated projects AND this repo)
```
specs/
├── README.md        # lifecycle: draft → approved → in-progress → implemented → verified
├── product.md       # vision, personas, glossary, non-functional reqs (perf, a11y, security, offline)
├── tech.md          # deviations from template (link ADRs), integrations, envs, API source
└── <feature-kebab>/
    ├── spec.md      # frontmatter: status, owner, created; sections: Problem · User stories · Acceptance criteria · Out of scope · Open questions
    ├── design.md    # Screens & navigation · Data/API (zod DTOs) · State · Flags · i18n namespaces · a11y · Analytics · Risks
    └── tasks.md     # ordered checklist
```

**Acceptance criteria format** (in `spec.md`):
```
- **AC-1** Given <context>, when <action>, then <outcome>.
```
- IDs are unique within the feature and never renumbered; a removed AC is struck through.

**Task line format** (in `tasks.md`):
```
- [ ] T1 (AC-1, AC-2) <imperative summary> — commit: feat(<scope>): <subject>
```

**Test linkage:**
- Jest test names start with the AC ID: `it('AC-1: navigates to Home after valid login', …)`.
- Maestro flows list their AC IDs in `tags:`.
- `yarn spec:check` fails if any AC in a spec with status `implemented` or `verified` has no linked test.

**Flow:**
1. `/spec` (skill `spec-new`) writes `spec.md` with status `draft`.
2. A human sets the status to `approved`.
3. `/plan` writes `design.md` and `tasks.md`.
4. `/implement` executes one task per commit, ticking its checkbox in the same commit.
5. When all tasks are done, set the status to `implemented`.
6. After QA or E2E, set it to `verified`.

---

## PART D — Workstreams & tasks

**Waves:**
- **Wave 0:** WS0. Serial; must merge first.
- **Wave 1:** WS1–WS8 in parallel.
- **Wave 2:** WS9–WS13, starting once WS3 and WS4 are merged. WS12 needs only WS5. WS13 runs continuously.
- **Wave 3:** WS14, integration.

**Task card format:**
- **Files:** what to create or modify.
- **Steps:** exact actions.
- **Done when:** verifiable checks.
- **Commits:** the suggested commit header(s).

---

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

### WS2 — Native & environments (Wave 1)
**Owns:** `template/android/**`, `template/ios/**`, `template/scripts/native/**`, `template/assets/bootsplash/**`, `template/src/assets/icons-source/**`, `.env.*`, and the run/build scripts in `template/package.json` (`scripts` section only).

**2.1 Android flavors**
- **`android/app/build.gradle`:**
  ```gradle
  project.ext.envConfigFiles = [
    devdebug: ".env.dev", devrelease: ".env.dev",
    stagingdebug: ".env.staging", stagingrelease: ".env.staging",
    proddebug: ".env.prod", prodrelease: ".env.prod",
  ]
  apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"
  ```
  Then:
  - Set `react { debuggableVariants = ["devDebug", "stagingDebug", "prodDebug"] }`.
  - Add `flavorDimensions "environment"`.
  - Add `productFlavors` per §B2, each with `applicationIdSuffix`, `resValue "string", "app_name", "<Display>"`, and `manifestPlaceholders = [deepLinkScheme: "<scheme>", deepLinkHost: "example.invalid"]`.
  - Set `buildConfigField "String", "APP_ENV", "\"dev\""` etc.
- **`AndroidManifest.xml`:**
  - `android:label="@string/app_name"`.
  - A VIEW intent-filter for `${deepLinkScheme}`.
  - An `https` + `${deepLinkHost}` intent-filter with `android:autoVerify="true"`, wrapped in a comment that explains how to set the real host.
  - Remove `app_name` from `res/values/strings.xml`.
- **`react-native.config.js`:** nothing needed. Scripts use `--mode`.
- **Scripts:**
  - `"android:dev": "react-native run-android --mode devDebug --appIdSuffix dev"`
  - Likewise for staging and prod (no suffix flag for prod).
  - Release: `"android:dev:release": "cd android && ./gradlew assembleDevRelease"`, and the matching bundle tasks `bundleProdRelease`.
  - `"start:dev": "react-native start"` (the env is chosen natively, so the start variants are aliases for clarity).
- **Done when:** the 3 debug variants install **side by side** on one emulator with the 3 names, and `ENV.APP_ENV` shows the right value. Use a temporary `Text`, then remove it. Paste a screenshot of the launcher.
- **Commits:**
  - `feat(android): add environment product flavors`
  - `feat(android): add deep link intent filters`
  - `build(template): add android env scripts`

**2.2 iOS configurations & schemes — via a script, never manual pbxproj edits**
- **Files:** `scripts/native/ios-envs.rb`, using the `xcodeproj` gem that ships with CocoaPods (add `gem 'xcodeproj'` to the Gemfile if it isn't resolvable). The script is idempotent. Given `--project ios/TempoApp.xcodeproj --target TempoApp --envs dev:Dev,staging:Staging,prod:Prod`, it:
  1. Creates the build configurations `Debug-<Env>`, based on `Debug`, and `Release-<Env>`, based on `Release`, at both project and target level.
  2. Sets each configuration's `baseConfigurationReference` to `ios/Config/<Env>.xcconfig`. Each xcconfig `#include`s the Pods xcconfig for that configuration, `Pods/Target Support Files/Pods-TempoApp/Pods-TempoApp.<config lowercased>.xcconfig`; the script writes it with `#include?`.
  3. Creates shared schemes `TempoApp-<Env>`: build/run/test use `Debug-<Env>`, archive/profile use `Release-<Env>`. Each has a pre-action on Build: `cp "${PROJECT_DIR}/../.env.<env>" "${PROJECT_DIR}/../.env"` (react-native-config reads `.env` on iOS); add `.env` to `.gitignore`.
  4. Deletes the default `TempoApp` scheme and the plain `Debug`/`Release` configurations, only after the env ones exist.
- **`ios/Config/<Env>.xcconfig`:**
  ```
  #include? "../Pods/Target Support Files/Pods-TempoApp/Pods-TempoApp.debug-dev.xcconfig"   // per config — see note
  PRODUCT_BUNDLE_IDENTIFIER = com.rntempo.app.dev
  APP_DISPLAY_NAME = Tempo Dev
  ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon-Dev
  APP_URL_SCHEME = tempo-dev
  APP_ENV = dev
  ```
  **Note:** the Pods include differs between Debug and Release. So create **two** files per env, `Dev.debug.xcconfig` and `Dev.release.xcconfig`, each `#include "Dev.shared.xcconfig"` plus its own Pods include. File names: `Config/<Env>.shared.xcconfig`, `Config/<Env>.debug.xcconfig`, `Config/<Env>.release.xcconfig`.
- **`Info.plist`:**
  - `CFBundleDisplayName = $(APP_DISPLAY_NAME)`.
  - `CFBundleURLTypes` with `$(APP_URL_SCHEME)`.
  - `APP_ENV = $(APP_ENV)` (informational).
- **`Podfile`:**
  ```ruby
  project 'TempoApp', 'Debug-Dev' => :debug, 'Release-Dev' => :release,
                      'Debug-Staging' => :debug, 'Release-Staging' => :release,
                      'Debug-Prod' => :debug, 'Release-Prod' => :release
  ```
- **Scripts:**
  - `"ios:dev": "react-native run-ios --scheme TempoApp-Dev --mode Debug-Dev"`, and likewise for staging and prod.
  - `"pods": "cd ios && bundle exec pod install"`.
  - `"ios:envs": "ruby scripts/native/ios-envs.rb --project ios/TempoApp.xcodeproj --target TempoApp --envs dev:Dev,staging:Staging,prod:Prod"`.
- **Universal links:** documented only. Add a `TempoApp.entitlements` with an empty `com.apple.developer.associated-domains` array, commented in the docs. **Do not** add domains, because that breaks unsigned builds.
- **Done when:**
  - The 3 schemes install side by side on one simulator with the correct names.
  - `xcodebuild -workspace ios/TempoApp.xcworkspace -scheme TempoApp-Prod -configuration Release-Prod -sdk iphonesimulator build` succeeds.
  - Re-running `yarn ios:envs` produces no diff.
- **Commits:**
  - `feat(ios): add environment configuration script`
  - `feat(ios): add per-environment xcconfigs and schemes`
  - `build(ios): map pod configurations`
  - `build(template): add ios env scripts`

**2.3 Per-env app icons**
- **Files:**
  - `scripts/native/icons.mjs`, using `sharp` (add it as a template devDependency, exact, in its own commit).
  - Source images: `src/assets/icons-source/app-icon.png` (1024×1024, a placeholder "T" logo committed as PNG) and `app-icon-foreground.png` (adaptive icon foreground, 432×432 with a safe zone).
- **What it generates:**
  - **Android**, under `android/app/src/<flavor>/res/`: `mipmap-{mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192}/ic_launcher.png` and `ic_launcher_round.png` (circle mask), plus `mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon with foreground and a background color `#FFFFFF` in `values/ic_launcher_background.xml`).
  - **iOS:** `ios/TempoApp/Images.xcassets/AppIcon[-Dev|-Staging].appiconset/` with a single 1024 universal icon and a `Contents.json` using the modern single-size format.
- **Badges:** a bottom ribbon with the §B2 text and color, white bold text at 18% of the icon height. Prod has no badge.
- **Script:** `"icons": "node scripts/native/icons.mjs"`.
- **Done when:** each launcher shows the correct icon, the ribbon is visible on dev and staging, and running the script twice produces byte-identical output (deterministic).
- **Commits:**
  - `build(deps): add sharp`
  - `feat(native): add per-environment icon generator`
  - `chore(native): generate app icons`

**2.4 Splash** (react-native-bootsplash)
- **Steps:**
  - Run `npx react-native-bootsplash generate src/assets/icons-source/splash-logo.png --platforms=android,ios --background=FFFFFF --logo-width=120 --assets-output=assets/bootsplash --flavor=main`. Check the flag names via context7.
  - Wire `MainActivity.kt` (`RNBootSplash.init`) and `AppDelegate.swift` per the docs.
  - `BootSplash.hide({ fade: true })` is called by WS3 bootstrap. Put a TODO in `App.tsx` that WS3 removes.
- **Done when:** the splash shows on cold start on both platforms and hides after bootstrap.
- **Commit:** `feat(native): add boot splash screen`

**2.5 Release hardening**
- **Android:**
  - `enableProguardInReleaseBuilds = true`, `shrinkResources true`.
  - `proguard-rules.pro`: keep rules for react-native-config (`-keep class com.rntempo.app.BuildConfig { *; }`), and for any libs whose docs require them (Reanimated, MMKV/Nitro, Keychain, SVG). Verify each lib's docs.
  - Release signing reads `TEMPO_UPLOAD_STORE_FILE`, `TEMPO_UPLOAD_STORE_PASSWORD`, `TEMPO_UPLOAD_KEY_ALIAS` and `TEMPO_UPLOAD_KEY_PASSWORD` from `~/.gradle/gradle.properties` or the environment. When they're absent, fall back to the debug keystore for local release testing only, with a warning.
- **iOS:** `PrivacyInfo.xcprivacy` gets `NSPrivacyAccessedAPITypes` entries for UserDefaults (CA92.1), FileTimestamp (C617.1) and SystemBootTime (35F9.1), as RN requires. Check the current RN docs.
- **Done when:** `./gradlew assembleProdRelease` builds and the APK launches (debug keystore fallback); the iOS Release-Prod simulator build works.
- **Commits:**
  - `build(android): enable r8 and release signing config`
  - `chore(ios): update privacy manifest`

**2.6 Native bits for other WS**
- **Keychain:** no native config needed. Verify.
- **Pinning:** no native config needed. Verify.
- **jail-monkey:** nothing to configure.
- **Fonts:** create the `src/assets/fonts/` folder + `react-native.config.js` `assets: ['./src/assets/fonts']`. No custom font ships; system fonts are used.
- **Commit:** `chore(native): prepare font asset linking`

---

### WS3 — App core infrastructure (Wave 1)
**Owns:** `template/src/{app,navigation,services,theme,config,test-utils}/**`, `template/src/locales/**`, `template/index.js`, `template/jest.config.js`, `template/jest.setup.ts`, `template/__mocks__/**`.

**Before writing any code, read the relevant ejada files and port the ideas, not the Redux code:**

| ejada file | Ported into |
|---|---|
| `src/services/api/apiClient.ts` | 3.4 |
| `src/storage/secureTokenStorage.ts` | 3.5 |
| `src/services/api/certificatePinning.ts` | 3.6 |
| `src/services/security/deviceIntegrity.ts` | 3.6 |
| `src/shared/theme/scaling.ts` | 3.2 |
| `src/shared/i18n/*` | 3.3 |

**3.1 Test infrastructure**
- **`jest.config.js`:**
  - preset `@react-native/jest-preset` (RN 0.88 name; verify).
  - `setupFiles` for the polyfills.
  - `setupFilesAfterEach`: `jest.setup.ts`.
  - `moduleNameMapper` for the §C4 aliases + svg → `__mocks__/svgMock.tsx`.
  - `transformIgnorePatterns` for RN libraries.
  - `coverageThreshold` global `{ lines: 70, branches: 60, functions: 70, statements: 70 }`.
- **`jest.setup.ts`:**
  - mocks for MMKV (the official mock or an in-memory Map), keychain (the official mock), netinfo (the official mock), react-native-config (reads `.env.dev` values)
  - reanimated (official setup), gesture-handler (jestSetup), bootsplash, unistyles (official mock: `react-native-unistyles/mocks`), localize, restart
- **MSW:** `src/test-utils/msw/server.ts` uses `setupServer` from `msw/native` (verify the v3 API) plus `beforeAll`/`afterEach`/`afterAll` in `jest.setup.ts`.
- **`renderWithProviders(ui, { route?, authenticated?, theme?, language? })`:** wraps a fresh QueryClient (retry false, gcTime Infinity), theme, i18n and a NavigationContainer. It returns RNTL's render result plus a `user` (`userEvent.setup()`).
- **Factories:** `factories/user.ts`, `factories/item.ts`.
- **Done when:** a sample test renders a `Text` through `renderWithProviders` and an MSW-mocked request resolves.
- **Commits:**
  - `test(test): add jest config and native mocks`
  - `test(test): add msw server and render helper`

**3.2 Theme (Unistyles 3)**
- **Files:** `theme/tokens.ts` (values), `themes.ts`, `breakpoints.ts`, `unistyles.ts`, `scaling.ts`, `index.ts`.
- **Light palette** (WCAG AA verified, ≥ 4.5:1 for text):

  | Token | Value |
  |---|---|
  | primary | `#2563EB` |
  | onPrimary | `#FFFFFF` |
  | background | `#FFFFFF` |
  | surface | `#F8FAFC` |
  | textPrimary | `#0F172A` |
  | textSecondary | `#475569` |
  | border | `#E2E8F0` |
  | error | `#DC2626` |
  | success | `#16A34A` |
  | warning | `#D97706` |
  | info | `#0284C7` |

- **Dark palette:**

  | Token | Value |
  |---|---|
  | primary | `#60A5FA` |
  | onPrimary | `#0B1220` |
  | background | `#0B1220` |
  | surface | `#111827` |
  | textPrimary | `#F1F5F9` |
  | textSecondary | `#94A3B8` |
  | border | `#1F2937` |
  | error | `#F87171` |
  | success | `#4ADE80` |
  | warning | `#FBBF24` |
  | info | `#38BDF8` |

  Fill the remaining tokens by analogy and document each one.
- **Typography:**

  | Variant | fontSize / lineHeight | fontWeight |
  |---|---|---|
  | display | 34 / 41 | 700 |
  | h1 | 28 / 34 | 700 |
  | h2 | 22 / 28 | 700 |
  | h3 | 20 / 25 | 600 |
  | title | 17 / 22 | 600 |
  | body | 16 / 22 | 400 |
  | bodyStrong | 16 / 22 | 600 |
  | bodySmall | 14 / 20 | 400 |
  | label | 14 / 18 | 500 |
  | caption | 12 / 16 | 400 |
  | button | 16 / 20 | 600 |

  Font family: `System` on iOS, `sans-serif` (with `sans-serif-medium` for 500/600) on Android, picked via `Platform.select`. Run all font sizes through `fontPx`.
- **`unistyles.ts`:** `StyleSheet.configure({ themes: { light, dark }, breakpoints, settings: { adaptiveThemes: true } })` plus TypeScript module augmentation for `UnistylesThemes` and `UnistylesBreakpoints`. `index.js` imports `./src/theme/unistyles` **first**.
- **Theme preference:** stored in MMKV `app.theme`.
  - `system`: `adaptiveThemes = true`.
  - Otherwise: `UnistylesRuntime.setAdaptiveThemes(false); UnistylesRuntime.setTheme(x)`.
  - Exposed through `useAppTheme()`, returning `{ theme, preference, setPreference }`.
- **Done when:** theme switching works at runtime without remounting; scaling unit tests cover the clamps.
- **Commits:**
  - `feat(theme): add tokens and light dark themes`
  - `feat(theme): configure unistyles`
  - `feat(theme): add scaling helpers`
  - `feat(theme): add theme preference hook`

**3.3 Storage, logger and i18n services**
- **`services/storage/`:**
  - `encryptionKey.ts`: get or create the key per §C15.
  - `storage.ts`: MMKV `createMMKV({ id: 'app-storage', encryptionKey })` (v4 API; verify), with typed `getString`/`setString`/`getBoolean`/`setBoolean`/`getJSON<T>(key, schema)`/`setJSON`/`remove`/`clearAll`.
  - `zustandStorage.ts`: a `StateStorage` adapter.
  - `keys.ts`: the `STORAGE_KEYS` const from §C15.
  - Initialization is async, because the key comes from the keychain. Export `initStorage(): Promise<void>`, called first in bootstrap. Accessing storage before init throws `StorageNotReadyError`.
- **`services/logger/logger.ts`:** `logger.debug/info/warn/error`, level-filtered by `ENV.LOG_LEVEL`. In prod (`!__DEV__`), only warn and error are kept, and they go to a pluggable `setLogTransport(fn)` (the Sentry recipe plugs in here). It wraps `console`; the eslint `no-console` rule is disabled with a reason comment only in this file.
- **`services/i18n/`:**
  - `i18n.ts`: i18next init with resources imported statically from `@locales/<lang>/<ns>.json`, `fallbackLng: 'en'`, `interpolation.escapeValue: false`, `returnNull: false`.
  - `i18next.d.ts`.
  - `languageManager.ts`: `getInitialLanguage()` (MMKV → device locale via react-native-localize → `en`) and `changeLanguage(lang)` (handles the RTL restart per §C11).
  - `useLanguage.ts`.
- **Locales:** create every namespace file in §C11 for `en` and `ar`, holding the keys needed by WS3 screens. Each WS adds its own keys to its own namespace files.
- **Done when:** unit tests cover the storage init order, the logger level filter, the initial-language resolution, and a mocked RTL restart path.
- **Commits:**
  - `feat(storage): add encrypted mmkv storage`
  - `feat(logger): add leveled logger with transports`
  - `feat(i18n): add i18next setup and language manager`
  - `feat(i18n): add base locale namespaces`

**3.4 HTTP client** (`services/http/`)
- **`client.ts`:** an axios instance with `baseURL` (`app.api-base-url-override` in non-prod, otherwise `ENV.API_BASE_URL`) and `timeout`.
- **Request interceptor:**
  1. Pinning gate (ejada pattern, behind the `ssl-pinning` markers).
  2. `Authorization` from `tokenStore.getAccessToken()` (sync, in-memory).
  3. `Accept-Language` from i18n.
  4. An `x-request-id` (random).
- **Response interceptor:** a 401 triggers a **single-flight refresh with a queue**, as in ejada. Refresh uses a separate bare axios instance and `POST /auth/refresh`. On failure: `unauthorizedHandler()`, injected via `setUnauthorizedHandler`.
- **`errors.ts`:**
  - `ApiError` class `{ status?, code: 'NETWORK' | 'TIMEOUT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'SERVER' | 'UNKNOWN', message, details? }`.
  - `normalizeError(e: unknown): ApiError`.
  - `getErrorMessageKey(err): string`, which maps to keys in the `errors` namespace.
- **`request.ts`:** a typed helper `request<T>(config, schema: z.ZodType<T>): Promise<T>` that **validates responses with Zod**. A parse failure becomes `ApiError` with code `UNKNOWN` and logs the issues in dev.
- **`queryClient.ts`:**
  - Defaults: `staleTime: 30_000`, `gcTime: 5 * 60_000`.
  - `retry`: `(count, err) => count < 2 && isRetryable(err)`.
  - `refetchOnReconnect: true`.
  - Wire `onlineManager` to netinfo and `focusManager` to AppState.
- **Done when:** MSW tests cover:
  - token attached
  - 401 → refresh → retried once
  - concurrent 401s → exactly one refresh call
  - refresh failure → handler called
  - timeout → `TIMEOUT`
  - schema mismatch → `ApiError`
- **Commits:**
  - `feat(http): add axios client with auth interceptor`
  - `feat(http): add single-flight token refresh`
  - `feat(http): add error normalization and zod-validated requests`
  - `feat(http): add query client with online and focus managers`

**3.5 Secure storage and auth store**
- **`services/secure-storage/tokenStore.ts`:** the ejada pattern — keychain persistence plus an in-memory cache, with `hydrate()`, `setTokens()`, `getAccessToken()`, `getRefreshToken()`, `clear()`. Service name `<bundleId>.auth-tokens`; read the bundle ID via `DeviceInfo`? **No:** avoid the extra dep and use the constant `APP_BUNDLE_ID` from `src/config/constants.ts`. The CLI renames it.
- **`features/auth/store/auth.store.ts`:** owned by WS3 because bootstrap needs it.
  - Zustand state `{ status: 'unknown' | 'signedIn' | 'signedOut', user: User | null, pendingLink: string | null }`.
  - Actions: `signIn(tokens, user)`, `signOut()` (clears tokens, the Query cache and the user), `setUser`, `setPendingLink`.
  - **Not persisted.** Status is derived at bootstrap from the token presence + `/auth/me`.
  - `features/auth/index.ts` exports the store hooks `useAuthStatus` and `useCurrentUser`.
- **Done when:** unit tests cover hydrate/set/clear and the store transitions.
- **Commits:**
  - `feat(security): add keychain token store`
  - `feat(auth): add auth store`

**3.6 Security services**
- **`services/security/pinning/pinning.ts`:** the ejada logic, using `ENV.SSL_PINS`:
  - It is fail-closed in prod: pinning disabled or failing → `false` → bootstrap shows a blocking `SecurityErrorScreen`.
  - The pin-mismatch listener logs and then calls `onSecurityCompromised('ssl')`, an injected callback.
  - The whole folder is wrapped in the `ssl-pinning` markers, plus its usages.
- **`services/security/integrity/integrity.ts`:** jail-monkey checks. Runs only when `ENV.DEVICE_INTEGRITY_ENABLED && !__DEV__`. On a compromise, the policy is a **block screen in prod** (`SecurityErrorScreen` with reason). Use the `device-integrity` markers.
- **Done when:** unit tests (mocking the libs) cover the enabled, disabled, prod and dev matrices.
- **Commits:**
  - `feat(security): add ssl public key pinning`
  - `feat(security): add device integrity check`

**3.7 Remote config and flags**
- **`services/remote-config/`:**
  - `AppConfigSchema` (Zod, §C13).
  - `fetchAppConfig()`: GET `ENV.APP_CONFIG_PATH`; on failure returns `DEFAULT_APP_CONFIG`, and never throws.
  - `useAppConfig()`: Query with `staleTime` 10 min.
  - `versionCompare(a, b)`, a semver-ish util in `shared/utils/version.ts` with tests.
- **`services/flags/`:** `useFeatureFlag(key)` with the resolution order from §C15. Overrides are kept in MMKV `flags.override.<key>`, non-prod only.
- **Commit:** `feat(remote-config): add app config with safe defaults` · `feat(flags): add feature flag resolution`

**3.8 Linking service**
- **`services/linking/`:** `openUrlSafe(url)` (`canOpenURL` + try/catch + toast on failure), `openStore()` (using `AppConfig.storeUrls`), `openSettings()`.
- **Commit:** `feat(linking): add safe url helpers`

**3.9 Navigation**
- **Files:**
  - `navigation/RootNavigator.tsx`: the static API. Uses groups with `if: useIsSignedIn` / `useIsSignedOut`, plus `ForceUpdate`, `Maintenance`, `NotFound`, and `DebugMenu` when `!isProd`, presented as a modal.
  - `AuthNavigator.tsx`
  - `MainTabs.tsx`: 3 tabs with icons from the `Icon` component. WS4 provides `Icon`; until then use placeholder text labels and leave a TODO tagged `WS4`.
  - Home, Profile and Settings stacks.
  - `linking.ts` (§C12 paths, including the `pendingLink` logic).
  - `navigationRef.ts`.
  - `useIsSignedIn.ts`.
  - Screens owned by other WS are imported from feature barrels. Until a feature exists, register a `PlaceholderScreen` from `src/app/screens/PlaceholderScreen`, which WS9 replaces.
- **Done when:**
  - `npx uri-scheme open "tempo-dev://settings" --android` opens Settings when signed in.
  - The same link while signed out opens Login, then Settings after login (integration test with a mocked linking).
- **Commits:**
  - `feat(navigation): add root auth and tab navigators`
  - `feat(navigation): add deep linking config`
  - `feat(navigation): resume pending deep link after sign in`

**3.10 Bootstrap**
- **`app/bootstrap/useBootstrap.ts`** runs these steps in order, with each failure handled:
  1. `initStorage`
  2. `initI18n`
  3. `initSecurity` (pinning, then integrity)
  4. `tokenStore.hydrate`
  5. if a token exists, fetch `/auth/me`, then `signIn`; otherwise `signOut`
  6. prefetch `fetchAppConfig`
  7. version gate: `currentVersion < minSupported` → `ForceUpdate`; `maintenance.enabled` → `Maintenance`
  8. `BootSplash.hide`
- **Returns:** `{ status: 'loading' | 'ready' | 'blocked', blockReason? }`.
- **Registration:** registers `setUnauthorizedHandler(() => authStore.signOut())`.
- **Done when:** a unit test with mocked steps covers the ordering and each failure branch.
- **Commit:** `feat(app): add ordered bootstrap sequence`

**3.11 App-level screens**
- **Screens:**
  - `ForceUpdateScreen`: message plus an "Update" button that calls `openStore`.
  - `MaintenanceScreen`: message plus "Retry".
  - `NotFoundScreen`: "Go home".
  - `SecurityErrorScreen`: no actions except Close.
  - `DebugMenuScreen`, non-prod only, with sections:
    - env info (`APP_ENV`, version, build, bundle ID)
    - API base URL override (text field, persisted, applies after restart)
    - feature flag overrides (switches)
    - clear MMKV / Query cache / tokens
    - open Storybook (`storybook` markers)
    - copy push token (placeholder)
- **Gesture:** a debug-menu shake gesture is out of scope. The menu opens via the `tempo-dev://debug` link and a 5-tap on the Settings → About version label (WS9).
- **Commits:**
  - `feat(app): add force update and maintenance screens`
  - `feat(app): add debug menu`

**3.12 App composition**
- **`AppProviders.tsx`** — provider order, outermost first:
  1. `GestureHandlerRootView`
  2. `SafeAreaProvider`
  3. `QueryClientProvider`
  4. `I18nextProvider`
  5. `ErrorBoundary` (from WS4; until then a local minimal one, with a TODO tagged WS4)
  6. `BottomSheetModalProvider`
  7. `NavigationContainer` (in `App.tsx`)
  8. `Toast` host
- **Dev tools:** the Rozenite plugins are registered in dev only (`__DEV__`) for TanStack Query, MMKV and network activity.
- **`index.js`:**
  - import `./src/theme/unistyles` first, then the polyfills needed by MSW when `ENV.API_MOCKING` is true.
  - start MSW native (`server.listen({ onUnhandledRequest: 'bypass' })`) only if `__DEV__ && ENV.API_MOCKING`.
  - then `AppRegistry.registerComponent`.
  - **Storybook switch:** if `ENV.STORYBOOK_ENABLED && !isProd`, register the Storybook root instead of App (`storybook` markers).
- **MSW handlers:** live in `src/test-utils/msw/handlers/` and are shared by tests and the dev mock mode. WS3 writes the `auth` and `app-config` handlers; WS9 adds the others.
- **Done when:** a cold start on dev with mocks lands on Login, and signing in with `emilys/emilyspass` reaches the Home placeholder.
- **Commits:**
  - `feat(app): compose providers and app root`
  - `feat(app): enable msw mock mode in dev`

**3.13 Network status**
- **`shared/hooks/useIsOnline`:** WS4 owns `shared/hooks`, so WS3 consumes it. To avoid blocking, WS3 implements `services/network/network.ts` (a netinfo subscription + Zustand `networkStore`), and WS4's `useIsOnline` reads `networkStore`.
  - **Add `network` to the §C10.2 scopes** and `services/network` to the §C5 list. **The integrator applies both contract amendments in WS0, before Wave 1 starts.**
- **Commit:** `feat(network): add connectivity store`

---

### WS4 — UI kit, hooks, utils, Storybook (Wave 1)
**Owns:** `template/src/shared/**`, `template/.rnstorybook/**`, `template/src/assets/{icons,images,animations}/**`, the storybook scripts, and `metro.config.js` (storybook wrapper only).

**Rules for every component:**
- Folder per §C5.
- Props type exported from `types.ts`.
- `testID` passed through.
- Accessibility props set: `accessibilityRole`, `accessibilityLabel` (prop or derived), `accessibilityState` (disabled, selected, checked, busy, expanded), and `hitSlop` so the touch target is ≥ 44×44.
- Styles via the Unistyles `StyleSheet.create((theme) => …)` with **variants** for size and appearance.
- RTL-safe: `start`/`end`, never `left`/`right`.
- Respects `useReducedMotion` for animations.
- A story covering every variant/state + controls.
- A test covering render, interaction and a11y role/state.

**4.1 Storybook setup**
- `.rnstorybook/{main.ts,preview.tsx,index.tsx}` per the @storybook/react-native 10 docs.
- The decorator wraps stories in the app providers with a theme toolbar (light/dark) and a language toolbar (en/ar with RTL).
- `metro.config.js` uses `withStorybook(config, { enabled: process.env.STORYBOOK_ENABLED === 'true', configPath: './.rnstorybook' })`. Check the v10 API.
- Scripts: `"storybook": "STORYBOOK_ENABLED=true react-native start"`, `"storybook:generate": "sb-rn-get-stories"`.
- Everything is wrapped in `storybook` markers, and the manifest lists the files and deps.
- **Commit:** `feat(storybook): set up on-device storybook`

**4.2 Primitives**

| Component | Requirements |
|---|---|
| `Text` | Props: `variant` (TypographyVariant), `color` (ColorTokens key), `align`, `numberOfLines`, `maxFontSizeMultiplier=1.5`. Accepts `children` or a `tx` i18n key + `txOptions`. |
| `Box` | View with spacing props (`p`, `px`, `py`, `m`, `gap`, `bg`, `radius`) mapped to tokens |
| `Row` | Box with `flexDirection: row`, `align` and `justify` props |
| `Column` | Box with `flexDirection: column`, `align` and `justify` props |
| `Spacer` | Size from spacing tokens |
| `Divider` | — |
| `Screen` | Props: `preset` (`fixed` \| `scroll`), `safeAreaEdges`, `keyboardAware` (uses `KeyboardAvoidingView` with platform behavior; no extra dep), `statusBarStyle` (auto from theme), `testID` |
| `Icon` | Typed `name: IconName` from the generated registry, `size`, `color` token. SVGs are imported via svg-transformer. Ship ~20 icons as SVG files under `src/assets/icons/` (home, user, settings, chevron-left, chevron-right, eye, eye-off, check, close, plus, search, alert-circle, info, wifi-off, refresh, logout, globe, moon, sun, trash), using **Lucide** icons (ISC license; include the license file). |
| `Image` | Wraps `@d11/react-native-fast-image`, with a placeholder and an error fallback |

- **Commits:** one per 2–3 components, e.g. `feat(ui): add text box row column primitives`, then `feat(ui): add screen and divider`, then `feat(ui): add icon registry and image`.

**4.3 Inputs**

| Component | Requirements |
|---|---|
| `Button` | Variants `primary`, `secondary`, `outline`, `ghost`, `danger`; sizes `sm`, `md`, `lg`; props `loading`, `disabled`, `leftIcon`, `rightIcon`, `fullWidth`; `accessibilityState.busy` while loading; Pressable with an opacity/scale press feedback (Reanimated, respects reduced motion) |
| `IconButton` | Requires `accessibilityLabel` |
| `TextField` | `label`, `placeholder`, `helperText`, `errorText`, `secureTextEntry` with an eye toggle, `left`/`right` adornments, `forwardRef`. Shows the error with `accessibilityLiveRegion="polite"`. |
| `FormTextField` | react-hook-form `Controller` wrapper: `name`, `control`, `rules` via Zod resolver at the form level. Error message translated from a validation key. |
| `OTPInput` | Length prop (default 6); auto-advance; paste support; `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` |
| `Checkbox`, `Radio` + `RadioGroup`, `Switch`, `Chip` | — |
| `Select` | Opens a BottomSheet list |

- **Commits:**
  - `feat(ui): add button and icon button`
  - `feat(ui): add text field and form text field`
  - `feat(ui): add otp input`
  - `feat(ui): add selection controls`
  - `feat(ui): add select`

**4.4 Display and feedback**
- Display: `Avatar` (image or initials), `Badge`, `Card`, `ListItem`.
- States: `Loader`, `EmptyState` (icon, title, message, action), `ErrorState` (built from an `ApiError` via `getErrorMessageKey`, with Retry).
- Shimmers: `Skeleton` primitives using react-native-fast-shimmer (`Bone`), plus `ListShimmer`, `CardShimmer`, `DetailsShimmer` and `ScreenShimmer` (port from ejada).
- Toast: `toast.show({ type, title, message })`, an imperative service wrapping react-native-toast-message with a themed config. **Location:** `src/services/toast/toast.ts` with the host component in `shared/components/ToastHost`. `services/toast` is also WS4-owned; the integrator notes this in WS0.
- Overlays: `BottomSheet` (gorhom wrapper with theme and a11y), `Modal`, `Dialog` (confirm/cancel; used for the RTL restart confirmation).
- App shell: `Header` (title, back button respecting RTL chevron direction, right actions), `OfflineBanner` (reads `networkStore`), `ConnectionModal` (ejada idea; shown after 5 s offline in blocking flows, optional prop), `ErrorBoundary` (class component; fallback = ErrorState + "Restart app"; logs via logger).
- **Commits:** one per 2–3 components.

**4.5 Hooks** (`shared/hooks`, each with a test)

`useDebounce`, `useDebouncedCallback`, `useThrottle`, `useInterval`, `useCountdown(seconds)` (returns `{remaining, isRunning, start, reset}`), `useToggle`, `useDisclosure`, `usePrevious`, `useMountEffect`, `useAppState`, `useIsOnline`, `useKeyboard` (`{isVisible, height}`), `useBackHandler(handler)`, `useReducedMotion`, `useRefreshOnFocus(refetch)` (TanStack pattern: skip first focus), `useOnFocus`, `useRTL`, `usePermissions` (thin wrapper over `PermissionsAndroid` and iOS no-op guidance; **no** react-native-permissions dep — document the recipe).

- **Commits:** `feat(hooks): add timing hooks`, `feat(hooks): add state hooks`, `feat(hooks): add device and app hooks`.

**4.6 Utils** (`shared/utils`, pure, each with a test)

| Util | Contents |
|---|---|
| `format.ts` | `formatDate(date, style, locale)` via `Intl.DateTimeFormat`; `formatRelativeTime` via `Intl.RelativeTimeFormat`; `formatNumber`; `formatCurrency(amount, currency, locale)`. No dayjs; Hermes Intl is enough (verify RN 0.88 Hermes Intl support for RelativeTimeFormat; if missing, stop and ask). |
| `string.ts` | `capitalize`, `truncate`, `initials`, `maskEmail`, `maskPhone` |
| `phone.ts` | `normalizePhone`, `isValidPhone` (E.164 regex) |
| `retry.ts` | `sleep(ms)`, `retry(fn, {retries, delayMs, backoff})` |
| `version.ts` | Shared with 3.7. WS4 owns it; WS3 imports it. |
| `platform.ts` | `isIOS`, `isAndroid`, `select` |
| `haptics.ts` | `Vibration`-based minimal impl. **No** extra dep; recipe for react-native-haptic-feedback. |
| `schemas.ts` | Zod: `emailSchema`, `passwordSchema` (min 8, a letter + a number), `phoneSchema`, `otpSchema` (6 digits), `nameSchema`. Messages are **i18n keys** in the `validation` namespace. |

- **Commits:** `feat(utils): add formatters`, `feat(utils): add string and phone helpers`, `feat(utils): add validation schemas`.

**4.7 Asset registries**
- `src/assets/icons/index.ts`, `images/index.ts` and `animations/index.ts` are generated with a header `// AUTO-GENERATED by scripts/assets-sync.mjs — do not edit`.
- `scripts/assets-sync.mjs` builds the typed maps (`IconName` union etc.). Script: `"assets:sync"`.
- The CLI's `tempo assets sync` later calls the same logic.
- **Commit:** `feat(ui): add typed asset registry generator`

---

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

### WS6 — Docs shell (Wave 1)
**Owns:** `docs/**`, plus moving the ADRs from `specs/adr` into `docs/content/docs/adr`.

**6.1 Fumadocs app**
- Scaffold with `npm create fumadocs-app` (Next.js, fumadocs-mdx), choosing the options that match RN-TEMPO's docs setup.
- Then copy over RN-TEMPO's useful bits — the `llms.txt`, `llms-full.txt` and `llms.mdx` routes and OG images — via `gh api repos/Abdelrahman-Yasser-1/RN-TEMPO/contents/docs/src/...`.
- Pin the §B3 versions.
- **Commit:** `feat(docs): scaffold fumadocs site`

**6.2 Information architecture**
- `content/docs/meta.json` sections (folders):
  - `getting-started`
  - `architecture`
  - `walkthrough`
  - `features`
  - `standards`
  - `ai`
  - `recipes`
  - `cli`
  - `upgrades`
  - `adr`
  - `project-docs`
- Each folder gets a `meta.json` and an `index.mdx` stub with a "coming in WS13" callout.
- **Commit:** `docs(docs): add information architecture`

**6.3 Custom MDX components** (`docs/src/components/mdx/`)
- `FileTree`: use the built-in one if Fumadocs provides it; otherwise build it.
- `AnnotatedCode`: props `file` (path relative to the repo root), `region?`, `highlight?`, `title?`. It reads the file at build time, extracts the `#region`, renders it with Shiki, and accepts child `<Note line={n}>` annotations shown beside the code. **The build fails if the file or region is missing.**
- `DoDont`: two code blocks, ❌ and ✅.
- `RuleCard`: rule name, severity badge, link, description, children examples.
- `EnvMatrix`: renders §B2 from `template/.tempo.json`.
- `CommandTabs`: yarn/npm tabs.
- `Mermaid`: client-side.
- `FeatureBadge`: module name and whether it's removable.
- **Commit:** one per 2 components.

**6.4 Seed pages**
- getting-started/{prerequisites, create-project, run-envs, troubleshooting}
- architecture/{overview, folder-structure (FileTree from §C5), boundaries (Mermaid of the §WS1 task 1.5 matrix), data-flow}
- The 12 ADRs
- **Commit:** `docs(docs): add getting started and architecture pages`

**6.5 Deploy**
- `.github/workflows/docs.yml`: build on PR; deploy on main to GitHub Pages via a Next static export, if fumadocs supports it with search (static search index). Otherwise Vercel — **ask the owner**.
- **Commit:** `ci(docs): add docs build and deploy`

---

### WS7 — AI layer (Wave 1)
**Owns:** `template/ai/**`, `template/AGENTS.md`, `template/CLAUDE.md`, `template/.claude/**` (except `settings.json` hooks, already done in WS0; WS7 may add permissions), `template/.cursor/**`, `template/.github/copilot-instructions.md`, `template/.github/instructions/**`, `template/.mcp.json`, `template/specs/**` (templates), `template/PROJECT.md`, and `packages/cli/src/ai/**` (the sync module only; coordinate with WS5 via the contract below).

**7.1 AI source** (`template/ai/`)

`rules/*.md`: one topic per file. Each file has a 1-line summary at the top, then ✅/❌ examples. Every rule must match the lint and contracts — **copy from §C, never paraphrase loosely**.

| File | Covers |
|---|---|
| `architecture` | §C5, §WS1 task 1.5 matrix |
| `styling` | Unistyles, tokens, no literals |
| `state` | Zustand for client state vs Query for server state, no tokens in stores |
| `api` | `request()` + Zod; query keys factory; mutations invalidate |
| `i18n` | §C11 |
| `a11y` | §WS4 rules |
| `testing` | renderWithProviders, MSW, `getByRole`, AC IDs |
| `naming` | §C5 |
| `security` | env, secrets, pinning |
| `commits` | §C10 + AI trailers |
| `specs` | §C16 flow |
| `generators` | "always use `yarn tempo g …` instead of hand-creating files" |
| `verification` | "run `yarn verify:changed` before finishing; never claim done with failing checks" |

`skills/<name>/SKILL.md`, each with frontmatter `name` and `description` (when to use) and steps that call the CLI and `yarn verify:changed`:

| Skill | Purpose |
|---|---|
| `spec-new` | Draft `spec.md` from a feature request; ask clarifying questions; AC IDs |
| `spec-plan` | Write `design.md` + `tasks.md` from an approved spec |
| `spec-implement` | Execute `tasks.md` one task per commit; update checkboxes |
| `create-feature` | — |
| `add-screen` | — |
| `add-component` | — |
| `write-tests` | — |
| `add-env` | — |
| `upgrade-rn` | Use the upgrade helper diff and the `tempo upgrade` output |
| `review-pr` | Apply the §E1 checklist adapted for projects |
| `a11y-audit` | — |

Other sources:
- `commands/*.md`: `spec`, `plan`, `implement`, `new-feature`, `new-screen`, `test`, `review`, `verify`, `log` (runs `yarn ai:start`/`ai:stop` for non-Claude tools).
- `agents/*.md`: `code-reviewer`, `test-writer`, `a11y-auditor`, `spec-writer`. Each has a role, the tools it may use, a checklist, and the output format.
- **Commits:** `docs(ai): add rules`, `feat(ai): add skills`, `feat(ai): add commands and agents`.

**7.2 Root agent docs**
- `template/AGENTS.md`, ≤ 250 lines, with sections:
  - Project overview (points to `PROJECT.md`)
  - Stack
  - Commands table
  - Folder map
  - Golden rules (top 15)
  - Where the rules live (`ai/rules`)
  - Specs flow
  - AI session logging
  - Docs `llms.txt` URL
- `CLAUDE.md`: `@AGENTS.md` import plus Claude-only notes.
- `PROJECT.md`: a template with sections Product, Domain glossary, Environments and URLs, Integrations, Deviations from template (each links an ADR), Team contacts, Release process.
- **Commit:** `docs(ai): add agents guide and project template`

**7.3 Sync module** (`packages/cli/src/ai/sync.ts`; WS12 wires it into a command)
- `syncAi({ cwd, tools: ('claude'|'cursor'|'copilot')[] })` reads `ai/` and writes:
  - **claude:** `.claude/skills/<name>/SKILL.md` (copy), `.claude/commands/<name>.md`, `.claude/agents/<name>.md`.
  - **cursor:** `.cursor/rules/<rule>.mdc` with frontmatter `description`, `globs` (from a `globs:` line in each rule's frontmatter) and `alwaysApply` (architecture, naming, verification = true); `.cursor/mcp.json` from `.mcp.json`.
  - **copilot:** `.github/copilot-instructions.md` (AGENTS.md condensed with links), plus `.github/instructions/<rule>.instructions.md` with `applyTo` globs.
- Generated files carry the header `<!-- generated by tempo ai sync from ai/… — edit the source -->`.
- **Idempotent:** a second run produces no diff (test).
- The template commits the generated outputs, so a project works before the CLI is installed.
- **Commits:** `feat(cli): add ai sync module`, then `chore(ai): generate tool-specific ai files`.

**7.4 MCP**
- `template/.mcp.json`:
  - `context7` (`npx -y @upstash/context7-mcp`)
  - `github` (the official GitHub MCP server via its remote URL, auth by env)
  - `figma` (Figma Dev Mode MCP local URL `http://127.0.0.1:3845/mcp`, documented as optional)
  - `maestro` (`maestro mcp`; requires the Maestro CLI)
- Verify each server's current launch command in its docs.
- The docs `llms.txt` URL is referenced in AGENTS.md, since it's not an MCP server.
- **Commit:** `feat(ai): add mcp configuration`

**7.5 Spec templates** (`template/specs/`)
- `README.md`: lifecycle and statuses.
- `product.md` and `tech.md` templates.
- `_templates/{spec,design,tasks}.md` with sections exactly as in §C16, including the AC-ID format and the task line format `- [ ] T1 (AC-1) <imperative summary> — commit: <type>(<scope>): <subject>`.
- `scripts/spec-check.mjs`: scans `specs/*/spec.md` for AC IDs and test files for `AC-n` in test names or Maestro `tags`, and reports any uncovered AC. Script: `"spec:check"`.
- **Commit:** `feat(specs): add spec templates and coverage check`

**7.6 PR "AI changes" comment action**
- `template/.github/workflows/ai-report.yml`: on `pull_request`, find the session files changed in the PR plus the trailers in the PR commits, and build a markdown comment (sessions, tool/model, prompts collapsed in `<details>`, commits). Upsert it via `marocchino/sticky-pull-request-comment`.
- Mirror it in the repo root `.github/workflows/`.
- **Commit:** `ci(ai): add ai changes pr report`

---

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

### WS9 — Features (Wave 2; after WS3 + WS4)
**Owns:** `template/src/features/{auth,home,profile,settings,onboarding,items}/**` (the auth store is already there from WS3), `src/test-utils/msw/handlers/{users,products,auth-extra}.ts`, `src/locales/*/{auth,home,profile,settings,items}.json`, `template/specs/{auth,home,profile,settings,onboarding,items}/**`.

**Every feature first writes `specs/<feature>/spec.md` + `design.md` + `tasks.md`** using the WS7 templates, opened as a separate commit `docs(specs): add <feature> spec`. It then implements per `tasks.md`, with tests named `AC-n: …`.

**9.1 auth**
- **Screens:** Login, Register, ForgotPassword, Otp.
- **Login:**
  - username + password via FormTextField + Zod.
  - On submit, `useLoginMutation` → `tokenStore.setTokens` → `authStore.signIn` → navigation switches automatically (the static `if` groups).
  - Errors use `ErrorState`/toast with mapped keys.
  - A dev-only hint shows the mock credentials.
- **Register:** first/last name, username, email, password + confirm → `/users/add` → navigate to Otp `{ purpose: 'register' }` → on verify, show a success toast and go to Login.
- **ForgotPassword:** email → `/auth/forgot-password` → Otp `{ purpose: 'reset-password' }` → success → Login.
- **Otp:** OTPInput, `useCountdown(60)` resend, verify `/auth/otp/verify`. Mock code `123456`.
- **Logout:** an action in Settings that calls `authStore.signOut()`.
- **AC:**
  - AC-1: valid login → Home
  - AC-2: wrong password shows the error
  - AC-3: offline submit shows the offline error
  - AC-4: OTP resend is disabled during the countdown
  - AC-5: logout clears tokens and cache
  - AC-6: a 401 refresh failure signs out
- **Commits:** spec → api (`auth.api.ts`, schemas, mutations) → each screen (screen + test) → handlers.

**9.2 onboarding**
- 3 slides (FlatList horizontal, pagination dots, Skip/Next/Get started).
- Shown when `onboardingEnabled` is on and `app.onboarding-completed` is false.
- AC: shown once; Skip persists completion.

**9.3 home**
- Greeting with the user's first name, a "Browse items" card (`samples` markers), and an offline banner.
- `useRefreshOnFocus` for `/auth/me`.

**9.4 profile**
- Profile view (avatar, name, email).
- EditProfile form → `PUT /users/:id` → optimistic update of the `['auth','me']` query + rollback on error.
- AC: validation errors; optimistic update rollback test.

**9.5 settings**
- Settings list: Language, Theme, About, Logout.
- Language: radio en/ar → confirm dialog → restart.
- Theme: system/light/dark.
- About: version/build (from `DeviceInfo`? **No dep** — use `Platform.constants` + a constant injected by Babel from `package.json` version, `APP_VERSION`; document it), and a 5-tap gesture on the version opens DebugMenu in non-prod.

**9.6 items** (`samples` module; the reference implementation of the "full pattern")
- `ItemsList`: FlashList, infinite query (`/products?limit=20&skip=`), pull-to-refresh, ListShimmer, EmptyState, ErrorState, a search field with `useDebounce(300)` (client filter on loaded pages; note that dummyjson supports `/products/search?q=`, so implement server search and add it to §C13 in the spec).
- `ItemDetails`: DetailsShimmer, image, price formatted via `formatCurrency`.
- `ItemCreate`: form behind the `itemsCreateEnabled` flag → `/products/add` → invalidate the list.
- Query keys factory `itemKeys = { all, lists, list(params), details, detail(id) }`.
- AC:
  - pagination loads the next page
  - refresh resets
  - empty and error states
  - search debounces
  - create invalidates the list
  - the flag hides create
- Everything is in `samples` markers, and the samples manifest lists `src/features/items/**`, the routes, handlers and locales.
- **Done when (whole WS):** `yarn verify` passes; coverage ≥ 70% on `features/`; a manual run on both platforms in en and ar (RTL) and light/dark, with screenshots in the PR.

---

### WS10 — Dynamic forms module (Wave 2)
**Owns:** `template/src/features/dynamic-forms/**`, `specs/dynamic-forms/**`, `src/locales/*/forms.json` (add `forms` to the §C11 namespaces and the §C10.2 scope `forms`, which already exists).
- **Port ejada's `config-driven-forms`** (read every file under `src/features/config-driven-forms`) to:
  - Zod 4
  - Unistyles 3
  - WS4 components
  - i18n keys (not literals)
  - the §C5 structure: `components/FieldRenderer`, `components/StepForm`, `components/sections/*`, `configs/flows/<flow>/steps/NN.step.ts`, `validation/buildValidationSchema.ts`, `validation/createFormResolver.ts`
- **Keep:** the field registry pattern, visibility conditions, repeatable sections, and per-step validation.
- **Route:** `DynamicFormFlow: { flowId: string }`, registered only inside the `dynamic-forms` markers.
- The whole folder sits in markers, with `defaultEnabled: false` in the manifest.
- **AC:** each field type renders; visibility rules; repeatable add/remove; step validation blocks Next; submit produces typed output.

---

### WS11 — E2E with Maestro (Wave 2; after WS9)
**Owns:** `template/e2e/**`.
- **Files:** `e2e/config.yaml`, `e2e/flows/{auth-login,auth-logout,items-browse,profile-edit,settings-language-rtl,deeplink-settings}.yaml`, `e2e/subflows/{login,launch-clean}.yaml`, `e2e/README.md`.
- Use `appId: ${APP_ID}` with a default `com.rntempo.app.dev`. Use only the §C14 testIDs. Tag flows with the AC IDs (`tags: [AC-1]`).
- Script: `"e2e": "maestro test e2e/flows"`.
- **Done when:** all flows pass locally on the Android emulator (devRelease, mocks on); the iOS simulator run is documented.
- **Commits:** one per 2 flows.

---

### WS12 — CLI advanced (Wave 2; after WS5 + WS7.3)
- `tempo ai sync|report` (wraps `syncAi` and `scripts/ai-log/report.mjs`)
- `tempo spec new <name>` (copies the templates) and `tempo spec check` (wraps `spec-check.mjs`)
- `tempo upgrade`:
  1. fetch the template at the project's `templateVersion` and at the latest
  2. apply the project's rename + feature removal to both
  3. produce a unified diff → write it to `.tempo/upgrade-<from>-<to>.patch`
  4. print a summary and the docs upgrade-guide link
  5. `--apply` runs `git apply --3way`
- `--json` output for every command; stable JSON shapes documented in the CLI docs.
- `create-tempo-app` calls `ai sync`.
- **Commits:** one per command.

---

### WS13 — Docs content (continuous; final pass in Wave 2)
- **Walkthrough:** one page per template file or group:
  - `package.json` scripts, babel, metro, tsconfig, eslint, lefthook, commitlint, `.env`
  - android `build.gradle` flavors, `AndroidManifest`, iOS xcconfigs, Podfile, `ios-envs.rb`, `icons.mjs`
  - `index.js`, `App.tsx`, `AppProviders`, bootstrap
  - http client, tokenStore, pinning, integrity, storage, i18n, theme
  - navigation + linking
  - jest setup, `renderWithProviders`
  - fastlane, workflows
  - ai-log scripts
- Each page uses `AnnotatedCode` with `#region` markers that the owning WS adds (a reviewer check). The source workstreams must add the regions the docs need, as requested via a docs issue list in `specs/ws13-docs/regions.md`.
- **Features:** one page per feature built in WS3, WS4 and WS9, with "How it works / How to use / How to customize / How to remove (module)".
- **Standards:** ESLint rules — generate `standards/eslint-rules.mdx` from a script that reads `@rn-tempo/eslint-config` and outputs a table of rules + severity, then hand-write ❌/✅ examples for the top 30 rules (port RN-TEMPO's eslint-rules page content).
- **AI:** setup per tool, skills and commands catalog, session logging and privacy (`logPrompts`), the spec flow walkthrough.
- **Recipes:** each one covers Why it's not in the template, Install, Code, Native steps per platform, Testing, Removal:
  - push notifications (notifee + FCM/APNs)
  - Sentry (with a logger transport)
  - analytics abstraction
  - OTA updates (hot-updater; CodePush is retired)
  - biometrics (react-native-biometrics / keychain access control)
  - payments/IAP
  - maps
  - websockets
  - offline sync (TanStack persist + MMKV)
  - Redux Toolkit + RTK Query migration
  - OpenAPI codegen (orval → TanStack Query hooks)
  - react-native-permissions
  - haptics lib
  - screenshot prevention
  - Firebase Remote Config adapter for flags
  - Codemagic/Bitrise ports of the Fastlane lanes
  - universal links/app links full setup (AASA + assetlinks.json)
  - custom fonts
- **CLI reference:** generated from the citty command meta via `packages/cli/scripts/gen-docs.mjs` → `docs/content/docs/cli/*.mdx`.
- **Upgrades:** a page per template version; changesets generate the changelog.
- **Project docs:** how to write `PROJECT.md`, ADRs and specs.

---

### WS14 — Integration & release (Wave 3; integrator)
1. **Template matrix CI** (root `.github/workflows/template.yml`):
   - (a) template as-is: `yarn verify`, Android `assembleDevDebug`, iOS `TempoApp-Dev` simulator build
   - (b) "minimal": run `create-tempo-app Minimal --template ./template --yes --features none` → verify + Android build
   - (c) "defaults": the same with the default features
   - (d) generated `tempo g feature wallet --register` → verify
2. **Contracts:** every manifest's `deleteGlobs` resolves to existing files; every marker is balanced (a CLI script runs in CI).
3. **Docs:** the region-include build passes; the `llms.txt` route returns content.
4. **Publishing:** changesets publish `@rn-tempo/*` and `create-tempo-app` with the `next` tag. Tag the template as `v1.0.0-rc.1`.
5. **Dry run:** create a project on a clean machine, run each env on both platforms, run an AI agent `/spec` → `/plan` → `/implement` for a small "favorites" feature, and confirm the session logs, trailers, PR AI report, Danger and spec-check.
6. **Release:** fix findings → `v1.0.0` → pilot on a real project.

---

## PART E — Review checklists

### E1. General (every PR)
- [ ] Matches the task card: no extra files, no missing files, owned paths only.
- [ ] Commits are small, Conventional, correctly scoped, and each one builds/lints. Deps are in separate commits.
- [ ] AI trailers and the session log are present when AI-assisted; the session log has the prompts and no secrets.
- [ ] No `any` / `ts-ignore` / unexplained `eslint-disable`; no `console`; no literal UI strings; no color or size literals.
- [ ] Every new unit has tests. Tests use `getByRole` where possible and AC-ID names for spec'd features.
- [ ] Library usage matches the docs for the pinned version; any deviation from the plan is explained in the PR.
- [ ] a11y: role, label and state on interactive elements, ≥ 44pt targets, works in RTL.
- [ ] `yarn verify` is green in CI; for native changes, both platforms are built by the reviewer.
- [ ] Docs regions are added where the walkthrough needs them; feature markers are balanced and the manifest is updated.

### E2. Workstream-specific
- **WS0:**
  - versions match `npm view`
  - aliases are identical in tsconfig and babel
  - `env.ts` matches §C3 exactly
  - the hooks work in Claude Code (reviewer runs one session)
- **WS1:** every invalid fixture fails with the expected rule; the valid fixture passes; the boundaries matrix equals §WS1 task 1.5; ESLint runs under 60 s on the template.
- **WS2:**
  - 3 apps side by side on both platforms
  - `ios-envs.rb` is idempotent
  - no hand-edited pbxproj noise
  - icons are deterministic
  - the release builds launch
- **WS3:**
  - concurrency test for refresh
  - pinning fails closed in a prod build
  - bootstrap order
  - no tokens in Zustand or MMKV
  - the RTL restart flow
  - MSW mode is off in prod builds
- **WS4:**
  - every component has story + test + a11y + variants
  - Storybook runs
  - dark mode and RTL screenshots
  - no new deps beyond §B3
- **WS5/WS12:**
  - fixture tests for markers, rename and removal
  - the generated project passes verify
  - `--json` is stable
  - no network calls in unit tests
- **WS6/WS13:** the build fails on a missing region; pages render on mobile width; links are valid.
- **WS7:**
  - the rules match the contracts and lint
  - `ai sync` is idempotent
  - generated files carry headers
  - MCP commands are verified
- **WS8:**
  - the workflows pass on a test PR
  - secrets are documented
  - Danger rules trigger on a crafted PR
- **WS9–WS11:** specs exist before code; ACs are covered by tests or flows; screenshots for en/ar and light/dark; Maestro passes.

---

## PART F — End-to-end verification (definition of done for v1.0.0)
1. `yarn install && yarn verify` passes at the repo root and in `template/`.
2. The dev, staging and prod apps install side by side on iOS and Android, with distinct names and badged icons.
3. A bad import, file name or commit message, or an AI trailer without a session, is rejected locally and in CI.
4. **Pinning:** a request through a Proxyman MITM fails with pinning on; a prod build with pinning off refuses to start.
5. **Deep links:** `npx uri-scheme open tempo-dev://items/1 --ios` (and `--android`) opens ItemDetails, after login if signed out.
6. **E2E:** `yarn e2e` passes on the Android emulator with mocks.
7. **CLI:** `npx create-tempo-app@next Demo --yes`, then `yarn tempo g feature wallet --register`, then `yarn verify` → green; `tempo feature remove ssl-pinning` → builds.
8. **AI:** a Claude Code session creates a `.ai/sessions` log with the prompts, commits carry trailers, the PR shows the AI report, and `/spec` → `/plan` → `/implement` yields green verify plus `yarn spec:check`.
9. **Docs:** they build and deploy; every walkthrough page renders real code regions; `llms.txt` serves.

---

## Contract amendments already decided (WS0 must apply these to the contracts before Wave 1)
- Add `services/network` and `services/toast` to §C5. `services/toast` is owned by WS4 and `services/network` by WS3.
- Add scopes `network`, `toast` and `docs-content` to §C10.2.
- Add namespace `forms` to §C11.
- Add `GET /products/search?q=` to §C13.
- Add the `APP_VERSION` Babel define (via `babel-plugin-transform-define` or an inline `process.env` replacement — **WS0 picks the simplest working option, records it in VERSIONS.md, and pins the dep**). `src/config/constants.ts` exports `APP_VERSION` and `APP_BUNDLE_ID`.

---

## Amendments from WS0 implementation (2026-10-24) — these override the text above

Recorded by the integrator during WS0. Where this list and the plan disagree, **this list wins**.

**Versions and tooling**
1. **Node:** `.nvmrc` = `24` (Node 26 is not LTS yet). `engines.node` = `>=24.3.0`.
2. **Version policy:** "newest stable version published more than 24 hours ago". Yarn 4.18 enforces this (`npmMinimalAgeGate: 1440` minutes) and refuses newer versions. Example: `i18next` is 26.5.6, not 26.5.7. `VERSIONS.md` holds the actual pins.
3. **Babel:** stays on the latest 7.x (7.29.x). `@react-native/babel-preset@0.88` depends on `@babel/core ^7.25`, so Babel 8 is not compatible yet (ADR-013).
4. **RNTL 14:** uses the `test-renderer` package (1.3.1). `react-test-renderer` and `@types/react-test-renderer` were removed.
5. **Vitest 5:** needs `vite` (8.3.5) as an explicit devDependency in every workspace that uses vitest.
6. **gitleaks 8.30:**
   - Use `gitleaks git --staged` (pre-commit) and `gitleaks git` (CI). `protect` is deprecated.
   - `.gitleaks.toml` (root and template) allowlists **lockfile checksum lines only**, matched on line shape. Tokens elsewhere in lockfiles are still caught.
   - `.gitleaksignore` lists known false-positive fingerprints.
7. **Dependency placement:**
   - The template already has every dependency installed (WS0 task 0.5).
   - **Lint plugins are dependencies of `@rn-tempo/eslint-config`, not of the template.** The template only has `eslint`, `prettier`, `typescript`, `@ls-lint/ls-lint`, `knip`, `i18next-cli`, `lefthook`, `@commitlint/cli` and `danger`.
   - `sharp` is already installed, so WS2 task 2.3 must **not** add it again.
8. **Config packages are linked with `link:`, not `portal:`** (e.g. `"@rn-tempo/eslint-config": "link:../packages/eslint-config"`). The plugins then resolve from the package's own location (the root `node_modules`), and the template lockfile does not change when the plugins change. WS1 adds these links. That is the only `package.json` dependency change allowed in Wave 1, and WS1 commits it on its own.
9. **`@react-native/new-app-screen`:** still used by the temporary `src/app/App.tsx`. WS3 task 3.12 removes the dependency when it replaces the root (separate `build(deps)` commit).
10. **`react-native-get-random-values`:** not installed. Per C15, stop and ask if Hermes `crypto.getRandomValues` is unavailable.

**Template code**

11. **App root:**
    - Moved to `src/app/App.tsx` as a **named** export `App`.
    - `index.js` imports `{ App }` from `./src/app/App`.
    - The old `__tests__/` folder is gone; `src/app/App.test.tsx` uses RNTL.
12. **`jest.config.js`:** minimal, with `testPathIgnorePatterns` for `/scripts/` (those tests use `node --test`) and `/e2e/`. WS3 task 3.1 extends it.
13. **`APP_VERSION`:**
    - `src/config/constants.ts` imports `version` from `package.json` (JSON import). No Babel define plugin, no extra dependency.
    - `APP_BUNDLE_ID` lives in the same file.
14. **`.env` files:** `.env.dev` is committed; the template `.gitignore` ignores `.env` and `.env.*` except `.env.example` and `.env.dev`.
15. **Template `.tempo.json`:** lists **all 10 modules**, because the template repo contains every module. `templateVersion` is `0.0.0` until the first release. Manifests use the unpkg `$schema` URL.

**Contracts and AI tracking**

16. **Contracts package:**
    - `@rn-tempo/contracts` is plain ESM (`index.mjs`, `markers.mjs`) plus a hand-written `index.d.ts`. No build step.
    - It already implements `scanMarkers`, `validateMarkers`, `stripFeature` and `commentStylesFor`. **WS5's `markers.ts` must reuse these, not re-implement them.**
17. **Commitlint:**
    - `@rn-tempo/commitlint-config` exports `createConfig({ extraScopes })`, plus a default export.
    - The scope amendments (`network`, `toast`, `docs-content`) are applied.
18. **AI log scripts:**
    - Core logic lives in `scripts/ai-log/lib.mjs` (helpers, frontmatter) and `session.mjs` (start/prompt/stop/trailers). The entry scripts are thin wrappers.
    - Session file names use **UTC**.
    - Claude hook commands use `"$CLAUDE_PROJECT_DIR/..."`.
    - `stage-session.mjs` refreshes `files`/`commits` before staging.
19. **Contract amendments:** the plan's own "Contract amendments already decided" section is applied:
    - `services/network` and `services/toast` folders exist.
    - Namespace `forms` and `GET /products/search?q=` are part of the contracts. WS3 and WS9 must include them.
