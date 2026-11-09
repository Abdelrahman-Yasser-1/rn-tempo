---
status: approved
owner: integrator (strong model), implemented by cheap models
created: 2026-11-02
plan: ../PLAN.md
---

# WS9b — Design system and conventions (between WS9 and WS10)

## Problem

The template works on device, but:

- All 22 screens mix logic and UI in one file, so they are hard to read, test and review.
- The look is a neutral blue placeholder. The owner's projects use the Saudi DGA-style design language: the SA green scale and IBM Plex Sans Arabic.
- The icon set is 20 hand-picked Lucide SVGs, with no pipeline for adding more.
- The component kit lacks many components that real government and fintech apps need.

This workstream fixes those four things before WS10 (dynamic forms) builds on them.

## Sources (read-only references)

| Source | What we take |
|---|---|
| `~/MOS/MOS-MOBILE-APP` (Ministry of Sports app, Saudi brand) | Color scales, IBM Plex Sans Arabic, component inventory and behaviour (not its code style) |
| `~/GoMoney/icons/{outline,filled}` | The icon set that now lives in `src/assets/icons`. These are Tabler Icons, MIT, 1,847 SVGs, 24×24, `currentColor` |
| `~/Half Million/react-native/Half-Million` | The asset pipeline (`scripts/assets.mjs` + svgr + typed registries), the logger redaction idea, the logical-properties lint idea, vendored AI skills |
| `github.com/EslamElMeniawy/react-native-temp` | `skip401Urls`, per-feature error boundary, shake-to-open debug menu with network logger |

**Do not copy** these things from MOS:

- its color bugs (`warning500` is an error red; the `rgba(…,10)` alpha)
- `allowFontScaling={false}`
- physical `left`/`right` styles
- moment.js, Redux, yup
- per-request checksum or cookie logic
- `specialCase` and other near-duplicate Button variants
- committed `.env` and certificate files

## Decisions (owner, 2026-11-02)

1. **Theme:** DGA style becomes the template **default**.
   - The current palette and system font are replaced.
   - Semantic `ColorTokens` keep their names, so components do not change.
2. **Icons:** follow Half-Million's pipeline.
   - The SVG sources stay in the repo, `yarn assets` validates them and generates react-native-svg components with svgr, and the typed `ICONS` registry plus the `IconName` union are generated.
   - **All icons in `src`, pruned at release (owner decision, 2026-11-03):** the whole Tabler set (about 1,860 icons, outline as `name.svg`, filled as `name-filled.svg`) lives in `src/assets/icons/`. `yarn assets` generates a component for every icon and the full `ICONS` registry, so `IconName` is one union of all names and `<Icon name=... />` autocompletes every icon, including icons added later.
   - **Easy add:** drop an `.svg` into `src/assets/icons/` and run `yarn assets` (or keep `yarn assets --watch` running; `yarn start` runs `yarn assets` first), or run `yarn icons:add <path-or-tabler-name> [--as <name>] [--filled]` (a path is normalized and copied; a Tabler name is fetched from `@tabler/icons@3.50.0` with `npm pack`). `yarn icons:search <term> [--remote]` finds names.
   - **Bundle-size rule:** release builds run `yarn icons:prune` (Fastlane build lanes, the `android:*:release`/`bundle` and `ios:*:release` scripts, the CI build workflows), which regenerates `src/assets/generated/` with only the icons a string literal names in `src` plus `ICON_KEEP` (`src/assets/icons.keep.ts`). `IconName` stays whole, `ICONS` becomes a `Partial` record, and `Icon` renders nothing for a missing name. `yarn icons:prune --restore` undoes it. Dev and debug builds are never pruned.
   - **RTL list:** `ICON_MIRRORED_IN_RTL` is generated into `generated/icons.rtl.ts` from the names (left/right arrows, chevrons, carets and corners without `up`/`down`, plus `login`, `logout`, `send`, `reply`, `forward`, `undo`, `redo`).
3. **Logic in hooks:** convention plus a lint **warning**.
   - Every screen with logic gets a co-located `use<Name>Screen.ts`.
   - Shared components with logic get `use<Name>.ts`.
   - Generators scaffold both. All existing screens and components are migrated.
4. **Components:** port **every generic component** MOS has that we lack, and upgrade the ones we have (mapping below).
   - Components that need a new native dependency become **optional modules** (feature toggles, off by default) so the default template stays lean.
   - The Hijri calendar is a docs recipe.

## Scope and PR order (one PR at a time; each PR green and device-toured before the next starts)

| PR | Content |
|---|---|
| A | Logic → hooks convention: lint, generators, migrate 22 screens and 4 components |
| B | DGA tokens and IBM Plex Sans Arabic font |
| C | Icon pipeline: `assets.mjs`, all icons in src, `icons:add`, `icons:prune`, the `Icon` rework, RTL mirroring, Lucide removal |
| D | Component upgrades: Button, TextField family, Toast, Header, Select, Loader, Card, ListItem, EmptyState, Image |
| E | New display and navigation components |
| F | New input components and `Form*` wrappers |
| G | Pickers and calendar (date, time, month, time slot) |
| H | Optional modules: `webview`, `file-picker`, `maps` |
| I | Hardening: logger redaction, `skip401Urls`, logical-properties lint, keyboard-controller, per-feature error boundary, shake debug menu with network logger, vendored AI skills |
| J | Lint and architecture hardening (deep comparison, below) |
| K | Tooling, scripts and DX (deep comparison, below) |
| L | Runtime services and test resilience (deep comparison, below) |
| M | `push-notifications` optional module, native version sync, Fastlane env badge |
| N | i18n hardening (stale keys, Arabic plurals, context, Intl formatters, no dynamic keys, dev missing-key warnings, typed selector) |

## Deep comparison adoptions (2026-11-02)

Full tables:

- `compare-half-million.md`
- `compare-eslam.md`

Both are in the integrator's session scratchpad; the integrator attaches them to PR J.

Only **Adopt** and **Adapt** items are listed here. Where the two repos overlap, the items are merged.

**PR J — lint and architecture:**

1. Lint-fixture harness. Every project rule gets a failing and a passing fixture with expected rule IDs, so a rule that silently stops firing fails the test. This extends the 12 cases in `packages/eslint-config/test`.
2. Dependency ownership map. Each SDK may be imported from exactly one service or adapter. This extends today's `no-restricted-imports` (netinfo, localize, svg/image, security, toast). A test fails on any unclassified runtime dependency.
3. Size and quality guards with loose numbers:
   - `max-lines` 300
   - `max-lines-per-function` 80
   - `max-params` 4
   - `max-depth` 4
   - `complexity` 15
   - `arrow-body-style`
   - `react/self-closing-comp`
   - `react/no-multi-comp` (warn)
4. `@eslint-community/eslint-comments`: `require-description`, `no-unlimited-disable`, and report unused disables. Promote `@eslint-react/no-array-index-key` to error.
5. Cheap bans:
   - `../` imports (aliases only)
   - `export *`
   - `process.env` outside `src/config`
   - branching on env-name literals outside `src/config`
   - color literals outside theme files
   - `Appearance`/`StatusBar` outside theme/app
   - `textAlign: 'left'|'right'`, folded into the logical-properties rule from PR I
6. Boundaries error messages that say what to do. Port a rule-block composition helper so a later `no-restricted-syntax` block cannot silently overwrite an earlier one.
7. RNTL 14 `testing-library/await-async-events` override. Extend the test-support import ban.
8. Aliases from one source: jest, babel and ESLint aliases are derived from tsconfig `paths`.

**PR K — tooling, scripts, DX:**

1. A `preinstall` Node-version guard (`scripts/check-node.mjs`); Yarn 4 ignores `engines`.
2. Env-file checks in `tempo doctor` and `verify`: the same keys in every `.env.*`, matching `.env.example`, and no stray root `.env` committed.
3. `verify:changed` escalates to a full run when configs change. Add a `--pr` Markdown report mode.
4. A `test:node` umbrella script that runs every `node --test` suite inside `verify`.
5. Lefthook `piped: true`, so prettier and eslint don't race on the same files.
6. A Markdown link and anchor checker for `docs/` and the template docs.
7. A `verify-bundle.mjs` that runs a `react-native bundle` dry run for iOS and Android. Renovate CI and the WS13 upgrade guide use it.
8. `@rnx-kit/align-deps` as a `tempo doctor` / CI check only. It catches RN-ecosystem versions that don't fit RN 0.88.
9. Scripts: `android:reverse` and `fresh-install`; check what `tempo clean` covers.
10. AGENTS.md:
    - a "Do not touch" list
    - a Definition of Done
    - a "Gotchas" section (e.g. Metro only drops the exact `if (__DEV__) { require() }` shape)
    - an RNTL-14 guidelines pointer
11. AI files:
    - Nested `AGENTS.md` for `features/`, `shared/components/` and `services/`, generated by `ai sync`.
    - Copilot `.github/prompts`.
    - A reviewer checklist for what lint cannot see.
12. Task guides (docs): add an env var, translation keys, an icon. Also a device test matrix skeleton.

**PR L — runtime services and tests:**

1. Upgrade-resilience integration tests. One smoke test per core library against the real stack: Unistyles, navigation, Query, MMKV, i18n, zustand. They catch library breakage after upgrades.
2. `createPersistOptions` for zustand: versioned step migrations that discard state when a migration fails.
3. `EnvError` and a pure `parseEnv` function (testable without `react-native-config`).
4. Logger: multiple sinks, with sink errors swallowed (on top of PR I's redaction).
5. MMKV area registry and per-env storage IDs, with encryption-key-loss recovery.
6. `StorageError` and an `isOperational` flag on errors.
7. `useFocusNotifyOnChangeProps`: queries re-render only on the focused screen.
8. A `ListLoadingMore` footer component, used by PaginatedList.
9. A declarative bootstrap step graph `{ id, dependsOn, run }` replacing the hand-ordered sequence.
10. External-link helpers: `openPhone`, `openEmail`, `openMaps` next to `openUrlSafe`.
11. Ratchet the coverage thresholds to 80/70/80/80.
12. A feature README per feature with a Public API section, generated by `tempo g feature` and checked against `index.ts` exports.
13. The typed i18n selector moved to PR N.

**PR N — i18n hardening**

Sources: Half-Million and https://mensurdurakovic.com/react-i18next-tips-and-tricks. These are already in place: typed `CustomTypeOptions`, namespace per feature, `fallbackLng: 'en'`, `escapeValue: false`, and `i18next-cli lint` + `extract --ci` in `verify`.

1. **Stale and conflicting keys fail CI.** Set `i18next.config.ts` → `extract.removeUnusedKeys: true`, `warnOnConflicts: 'error'` and `sort: true`, so `extract --ci` flags keys that no longer exist in code (the article's "stale keys" anti-pattern).
2. **Plurals proven for Arabic:**
   - Add the first real plural key (items count, e.g. `items:list.count`) using `count`.
   - `extract --ci` must require all six Arabic forms (`zero`, `one`, `two`, `few`, `many`, `other`) through `Intl.PluralRules`.
   - A Jest test renders counts 0, 1, 2, 3, 11 and 100 in `ar` and `en`.
   - The device tour confirms Hermes' `Intl.PluralRules` resolves them.
3. **Context convention for gender and role variants.** Keys `<key>_male` / `<key>_female` (or `_admin` / `_user`) are selected with `t(key, { context })`. Documented, with one real usage plus a test. Arabic needs gendered forms, e.g. "welcome" addressed to the user.
4. **Built-in formatting in messages.** Use `{{amount, currency(USD)}}`, `{{date, datetime}}` and `{{n, number}}` through i18next's Intl formatters, so numbers and dates inside sentences follow the active language. Register app formatters through `i18n.services.formatter.add`. `@shared/utils/format` stays for values outside sentences.
5. **No dynamic keys.**
   - Template-literal keys (``t(`status.${s}`)``) lose type safety and break extraction.
   - Use an `as const` map from value to key instead.
   - Add a lint rule (`no-restricted-syntax` on a `t()` call whose first argument is a template literal with expressions) and an ai rule.
6. **Missing keys are loud in development.**
   - In `__DEV__`, set `saveMissing: true` with a `missingKeyHandler` that calls `logger.warn`.
   - In release builds, behaviour is unchanged.
   - `debug` turns on only when `LOG_LEVEL=debug`.
7. **Typed selector API** `t($ => $.login.title)` (i18next ≥ 25 `enableSelector`). **Approved by the owner (2026-11-03).** It makes keys rename-safe and IDE-navigable, but changes every `t()` call. A codemod plus a lint rule would keep both styles from mixing. Done as the last step of PR N.

Skipped in PR N:

| Skipped | Reason |
|---|---|
| Inline default values (`t(key, 'Default')`) | Typed keys plus `extract --ci` already make missing keys impossible, and the defaults would duplicate the English source |
| `i18next-icu` | Adds a dependency; native plurals, context and Intl formatters cover the same needs |
| `fallbackNS` | Hides missing keys |

**PR M — modules and release:**

1. `push-notifications` optional module: FCM plus notifee, channels, contextual permission request, payload → deep-link routing through `linking`, no payload logging, mocked in Jest.
2. Native version sync: release-please bumps `package.json`; Gradle `versionName` and the iOS `MARKETING_VERSION` are derived from it.
3. Fastlane `set_badge` env badge on non-prod builds, applied to a temporary copy of the icons. This complements the generated badge icons from WS2.

**PR M2 — Firebase per environment and crash reporting:**

Owner decisions (fixed):

1. One Firebase project per environment (dev, staging, prod) is the documented recommendation.
2. Config files live in `firebase/<env>/google-services.json` and `firebase/<env>/GoogleService-Info.plist` at the template root. Dev files may be committed; `firebase/staging/` and `firebase/prod/` are gitignored and CI writes them from secrets. The template ships no real files, only `firebase/README.md` and the ignore rules.
3. Defaults: dev has push off and crash reporting off; staging and prod have push on and crash reporting on. Debug builds never report crashes.
4. Crashlytics ships as an optional module; Sentry is a docs recipe with a complete adapter. App code depends only on a provider-neutral `CrashReporter` interface.
5. Users can opt out of crash reports (a persisted Settings switch). Collection is off until the app enables it.
6. CI uploads symbols (Fastlane): Crashlytics dSYMs on iOS and the Crashlytics Gradle plugin's mapping upload on Android release. Firebase Analytics is out of scope.

Scope:

1. `firebase-core` optional module (default off): `@react-native-firebase/app`, `src/services/firebase`, the native Firebase wiring and the per-environment config-file copy steps. `push-notifications` and `crashlytics` require it.
2. `PUSH_ENABLED` and `FIREBASE_ENABLED` env keys; push does nothing unless both are on and Firebase is configured.
3. `src/services/crash-reporting`: `CrashReporter` interface, no-op reporter, registry, facade, logger sink, error reporting, opt-out, `CRASH_REPORTER` and `CRASH_REPORTING_ENABLED` env keys, bootstrap step and a Settings switch.
4. `crashlytics` optional module (requires `firebase-core`): the only code that imports `@react-native-firebase/crashlytics`, plus the Android Gradle plugin and the iOS dSYM build phase.
5. Fastlane `upload_symbols_to_crashlytics` for iOS builds of environments that have Crashlytics on.
6. Docs: Firebase per environment, push per environment, crash reporting, Crashlytics, a Sentry recipe, switching providers, troubleshooting; ADR-014.

Acceptance criteria:

- AC-M2-1: Each environment uses only its own Firebase files; no build bundles another environment's config.
- AC-M2-2: An environment with Firebase off builds and runs with no Firebase initialisation.
- AC-M2-3: Push is switched on or off per environment through `.env.<env>` only.
- AC-M2-4: Crash reporting is switched on or off per environment and per user (opt-out), and debug builds never report.
- AC-M2-5: Every crash report carries the environment (`app_env`).
- AC-M2-6: App code never imports a crash SDK outside its adapter file.
- AC-M2-7: The docs let a newcomer set up Firebase per environment, Crashlytics and Sentry, and switch between them.

**Skipped, with reasons:**

| Source | Skipped | Reason |
|---|---|---|
| Half-Million | Types only in `*.types.ts` | Too rigid |
| Half-Million | Domain layer, atomic UI folders | Our feature/shared split is enough |
| Half-Million | `noInlineConfig` | Disables need to stay possible with a reason |
| Half-Million | 200-line / max-3-params limits | Too strict |
| Half-Million | Gradle/Podfile env guards | Ours map env per variant |
| Half-Million | Build-only feature switches | Ours also support remote flags |
| EslamElMeniawy | Local packages per module, `link:` | Not worth the overhead |
| EslamElMeniawy | DI registries, `injectReducer` | We use Zustand, not Redux |
| EslamElMeniawy | Fakers / `USE_FAKE_API` | Our dev mock adapter covers this |
| EslamElMeniawy | Enums | Forbidden by our rules |
| EslamElMeniawy | `@{push}` lefthook selection | Not needed |
| EslamElMeniawy | ESLint 8 config | Outdated |
| EslamElMeniawy | Detox | We use Maestro |
| EslamElMeniawy | Redux | We use Zustand |

## Component mapping (MOS → template) — nothing is dropped silently

**Upgrade an existing component:**

| MOS | Template |
|---|---|
| Button | Button: variants `primary`, `neutral`, `secondary`, `outline`, `outlineOnColor`, `subtle`, `ghost`, `danger`, `dangerOutline`, `dangerSubtle`, `dangerGhost`, `link`; sizes sm/md/lg; `iconPosition` start/end |
| TextInput, FormInputLabel, FormInputBottomMsg | TextField: `required` marker, `subLabel`, `prefix`/`suffix`, `readOnly`, `tooltip`; extract `FieldLabel` and `FieldMessage` |
| TextArea | `TextArea`, a TextField multiline wrapper with a counter |
| Toast | toast: `actions`, `isClosable`, `isFixed`, description |
| Appbar, NavigationHeader, NavigationAction | Header: `actions[]`, transparent/onColor variants |
| DropDownInput, DropdownSheet, SelectBox | Select: searchable sheet, empty state, `readOnly` |
| AppLoader, SimpleLoader, Spinner | Loader: inline, full-screen overlay |
| Card, Card Section, CardImageLayer | Card: `CardSection`, `media` with an image layer |
| ListCard | ListItem: `ListItemContent` layout variants |
| NoData | EmptyState: illustration slot |
| SmartImage | Image: fallback and loading states |
| AppBottomSheet | BottomSheet: unchanged API; title/footer slots |
| Toggle | Switch: label position |
| Avatar, Checkbox, Chip, Divider, IconButton, RadioGroup, Skeleton, Text | Restyle with DGA tokens only |
| Icon | Icon: rework per PR C |

**New component:**

| MOS | New component |
|---|---|
| Accordion | Accordion |
| Tabs | Tabs |
| ContentSwitcher | SegmentedControl |
| Tooltip | Tooltip |
| Stepper, NewStepper, FormStepper (template) | Stepper (indicator), StepperLayout (multi-step shell: header, progress, footer, success) |
| FormSummary, NewFormReview, FormReview, ReviewTemplate | FormReview (sectioned label/value summary with edit actions) |
| DescriptiveTableCell, TableCardView | DescriptionList, KeyValueRow |
| Timeline | Timeline |
| Indicator | StatusIndicator (dot + label) |
| Inlinemsg | InlineMessage (info/success/warning/error banner) |
| SectionHead | SectionHeader |
| LinkButton, TextLink | Link (inline text link; the Button `link` variant covers buttons) |
| FabButton, ScrollToTopFAB | Fab, `useScrollToTop` hook |
| Pagination, PaginatedView | Pagination (page numbers), PaginatedList (infinite query helper) |
| CounterInput | NumberInput (− value +) |
| Slider | Slider (`@react-native-community/slider` moves from dev to runtime deps) |
| Multiselectinput, Multiselectmenu | MultiSelect |
| PhoneInput, MobileCountryCode | PhoneInput, CountryPicker |
| DateTimeSheet, CalendarSheet, DayMonthCalendar, MonthPicker, TimelineCalendar | DatePickerSheet, TimePickerSheet, MonthYearPicker (calendar dependency decided in PR G) |
| TimeSlotSheet | TimeSlotPicker |
| FilterCard, RowsFilterButton | FilterBar (chips + filter button with a count badge) |
| UserInfo, MemberInfo | UserCard (generic avatar + name + meta) |
| AuthLayout, MainLayout, AnimatedLayout (templates) | AuthLayout, ScreenLayout (header + content + sticky footer), with an `animated` prop |
| HookForm\* (15 wrappers) | `Form*` for every input: FormCheckbox, FormSwitch, FormRadioGroup, FormSelect, FormMultiSelect, FormTextArea, FormNumberInput, FormSlider, FormPhoneInput, FormOtpInput, FormDatePicker, FormTimePicker, FormMonthYearPicker, FormTimeSlot, FormFilePicker (module), FormMapPicker (module) |

**Optional module (feature toggle, default off; native dependency):**

| MOS | Module |
|---|---|
| AppWebView | `webview` module → WebViewScreen |
| UploadFile, MultiFileUploader, AttachmentInput | `file-picker` module → FilePicker, MultiFilePicker |
| MapPicker | `maps` module → MapPicker |

**Recipe (docs only):**

| MOS | Recipe |
|---|---|
| portable/CalendarSheet, portable/HijriCalendar | Hijri (Umm al-Qura) calendar recipe |

**Skipped (app-specific, generic equivalent listed):**

| MOS | Reason |
|---|---|
| MontasebCard | Domain card; use Card |
| SeasonsTimeline | Domain timeline; use Timeline |

## Acceptance criteria

- **AC-1** Every screen or component with logic has a co-located `use<Name>Screen.ts` / `use<Name>.ts` with tests. Lint warns when a screen view imports `react-hook-form`, `@tanstack/react-query` or `useNavigation`. The CLI generators scaffold the hook.
- **AC-2** The theme uses DGA scales (SA green brand `#1B8354`) and IBM Plex Sans Arabic on iOS and Android. Text contrast meets WCAG AA in light and dark.
- **AC-3** Every icon is in `src/assets/icons` and in the `IconName` autocomplete. A dropped-in `.svg` or `yarn icons:add <path-or-name> [--as <name>] [--filled]` is in the autocomplete after `yarn assets`. `yarn assets` / `yarn assets:check` validate and generate. `yarn icons:prune` keeps only the icons the code names, for release builds. Directional icons mirror in RTL from a generated list. The Tabler license ships in `src/assets/icons`.
- **AC-4** Every row in the mapping above is implemented, recipe'd or skipped as stated. Each component has a story, a test and a11y props, and is RTL-safe.
- **AC-5** The optional modules (`webview`, `file-picker`, `maps`) add or remove cleanly via the CLI. The `packages/cli` e2e round-trip passes.
- **AC-6** Every PR passes `yarn verify` plus a Maestro device tour on iOS and Android (en + ar, light + dark) before it is ready (amendment 46).

## Out of scope

- Official DGA token packages. None was found; tokens come from the MOS Saudi palette.
- Redesigning WS9 feature flows beyond restyling.
