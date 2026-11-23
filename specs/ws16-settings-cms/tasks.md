# WS16 tasks

Format: `- [ ] T<id> (AC…) <summary>: commit: <header>, docs: <page>`. Each task ships its own docs update in the same PR, usually as the task's last commit (plan amendment 53). Tick a box in the same commit that completes the task.

**Phases.** Each phase is one branch and one PR, from an up-to-date `main` (amendment 52). The commits are pushed as they are made.

## Phase A: themes (`ws16/a-themes`)
- [x] T16.A1 (AC-T-1) Add palette definitions Ocean, Forest and Sunset, each with light and dark variants, built from palette primitives like the default one. Commit: `feat(theme): add ocean forest and sunset palettes`.
- [x] T16.A2 (AC-T-3) Contrast test over every theme variant. Commit: `test(theme): check wcag contrast for every theme`.
- [x] T16.A3 (AC-T-2) Register all variants in Unistyles. Split the preference into mode + palette (`app.theme`, `app.palette`), and migrate the old stored value. Commit: `feat(theme): separate theme mode from palette`.
- [x] T16.A4 (AC-T-1, AC-T-4) Theme screen gets a palette picker with swatches; the Storybook toolbar lists the variants. Commit: `feat(settings): add palette picker`. Docs: `features/theming`.

## Phase B: font scale (`ws16/b-font-scale`)
- [x] T16.B1 (AC-F-2, AC-F-3) `fontScale` in the theme layer, persisted in `app.font-scale`, applied before the first render, and fed into typography. Commit: `feat(theme): add user font scale`.
- [x] T16.B2 (AC-F-1, AC-F-4) Text size screen with a preview, route `settings/text-size`, and en/ar strings. Commit: `feat(settings): add text size screen`.
- [x] T16.B3 (AC-F-2) Audit fixed heights at Extra large, in Maestro and Storybook. Fix any clipping. Commit: `fix(ui): avoid clipping at large text sizes`. Docs: `features/settings` (text size).

## Phase C: languages (`ws16/c-languages`)
- [x] T16.C1 (AC-L-2) Add `es`, `de` and `fr` locale files for every namespace, plus `TRANSLATIONS.md` (AC-L-5). Commit: `feat(i18n): add spanish german and french`.
- [x] T16.C2 (AC-L-1, AC-L-3) Language registry: native names, `isRTL` per language, detection and fallback. Only an LTR↔RTL switch restarts. Commit: `feat(i18n): support five languages`.
- [ ] T16.C3 (AC-L-2, AC-L-4) Plural and Intl tests per language. Commit: `test(i18n): cover plurals and formats per language`.
- [ ] T16.C4 (AC-L-1) Language screen lists all five. Docs: `features/i18n` (adding a language). Commit: `feat(settings): list all supported languages`.

## Phase D: app icon (`ws16/d-app-icon`)
- [ ] T16.D1 (AC-I-3) Icon generator: alternate sources, badges per env, iOS `AppIcon-<Name>` sets plus `CFBundleAlternateIcons`, and Android `mipmap` sets per alternate. Commit: `feat(native): generate alternate app icons`.
- [ ] T16.D2 (AC-I-1) Native bridge. Check the docs for a maintained library that supports RN 0.88 New Architecture; otherwise write a small TurboModule (`AppIconModule`) for iOS (`setAlternateIconName`) and Android (`activity-alias` toggling). Commit: `feat(native): add app icon switching module`.
- [ ] T16.D3 (AC-I-1, AC-I-2, AC-I-4, AC-I-5) App icon screen and service, persisted, with an unsupported state. Commit: `feat(settings): add app icon picker`.
- [ ] T16.D4 Manifest `app-icons` with markers, plus the CLI round-trip. Docs: `features/app-icons`. Commit: `feat(template): make app icons a removable module`.

## Phase E: CMS module (`ws16/e-cms`)
- [ ] T16.E1 (AC-C-1) `services/cms`: `CmsClient`, Zod schemas, key factory and hooks. Env keys in `env.ts`, in markers. Commit: `feat(cms): add provider-agnostic cms client`.
- [ ] T16.E2 (AC-C-2) `tempo` adapter (default, reads the WS15 content API) and Sanity adapter (no token), both tested against the Tempo local backend test kit (`@rn-tempo/local-backend/test`; dev-api is retired in T15.Z9). Commits: `feat(cms): add tempo backend adapter`, `feat(cms): add sanity adapter`.
- [ ] T16.E3 (AC-C-3, AC-C-4, AC-C-7) "What's new" screen, route, Home entry, content types and entries in `backend/backend.json` and its seed, strings in all 5 languages, and a run against the local backend. Commit: `feat(cms): add whats new sample screen`.
- [ ] T16.E4 (AC-C-5) `.tempo/features/cms.json`, markers, and the CLI e2e case. Commit: `feat(template): add cms module manifest`.
- [ ] T16.E5 (AC-C-6) Docs: `features/cms` and the recipe `recipes/cms-providers` (Strapi, Contentful). Commit: `docs(cms): add cms module and provider recipe`.

## Phase F: verification (`ws16/f-e2e`)
- [ ] T16.F1 Maestro flows: `settings-theme-palette`, `settings-text-size`, `settings-language-five`, `settings-app-icon` (Android), `cms-whats-new` (module on). Commit: `test(e2e): cover settings customization and cms`.
- [ ] T16.F2 Device tour on the iOS simulator and the Android emulator: 5 languages × light/dark × one brand palette × Extra large text. Screenshots go in the PR.
