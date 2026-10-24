---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS13 — Docs content (continuous; final pass in Wave 2)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** See plan section.

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

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
