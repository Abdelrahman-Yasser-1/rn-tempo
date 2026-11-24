---
status: approved
owner: implementer, reviewed by the integrator
created: 2026-11-16
plan: ../PLAN.md
---

# WS16: Settings customization and the CMS module (Wave 4, after WS15)

Four user-facing settings: font size, app icon, theme, language. Plus one optional module, `cms`. It runs after WS15, so the CMS builds directly on the backend's content API. The WS11 Maestro flows are extended to cover these settings.

## Problem

The settings feature (WS9) offers only light/dark/system and en/ar. Real apps routinely ask for more:
- text size beyond the OS setting, for accessibility
- a brand-chosen alternate app icon
- several color themes
- more languages
- marketing or help content that non-developers edit without a release

Each of these has native or architectural parts (alternate icons, Unistyles theme registration, plural rules, a content API), so they belong in the template rather than in every project.

## Decisions (owner, 2026-11-16)

1. **Font scale.** A user setting multiplies the theme typography. It works on top of the OS font scale and inside the existing caps (`fontPx` clamp, `maxFontSizeMultiplier`).
2. **App icon.** The user picks the launcher icon from a bundled set (alternate icons), on iOS and Android.
3. **Themes: Light, Dark + 3 brand palettes** (Ocean, Forest, Sunset).
   - Each brand palette defines every `ColorTokens` value, in a light and a dark variant.
   - Every variant passes WCAG AA, checked by a test.
   - The mode setting (system/light/dark) stays separate from the palette choice.
4. **Languages: en, ar, es, de, fr** (five, confirmed). Three new LTR languages. Arabic stays the only RTL language.
5. **CMS: provider-agnostic.**
   - It is the optional module `cms` (`defaultEnabled: false`), removable and re-addable by the CLI like every other module.
   - The default adapter is `tempo`. It reads the WS15 backend's public content API, and content is edited in the local backend's Content tab (Mac app or web dashboard).
   - The Sanity adapter shows how to plug in an external hosted CMS. Strapi and Contentful are covered by a docs recipe.
   - No write token ships in the app. The app reads published content only.
6. **App icons are their own removable module**, `app-icons` (`defaultEnabled: true`), because they touch native files.
7. **Order:** WS16 runs after WS15 (the backend).

## Scope

Owns:
- the `settings` feature screens added here: `FontSize`, `AppIcon`, plus Theme and Language changes
- `src/theme/**` (palettes, theme registry, font scale)
- `src/services/cms/**`
- `src/locales/{es,de,fr}/**`
- native alternate-icon files and the icon generator changes
- `.tempo/features/cms.json` and `.tempo/features/app-icons.json`
- these docs pages: `features/settings`, `features/theming`, `features/i18n`, `features/cms`, `features/app-icons`
- `ai/rules/{styling,i18n}.md`

## Acceptance criteria

### Font scale (AC-F-*)
- **AC-F-1** Given Settings → Text size, when the user picks Small (0.9), Default (1.0), Large (1.15) or Extra large (1.3), then every `Text` variant re-renders at that scale without an app restart.
- **AC-F-2** Given a font scale and an OS font scale, when text renders, then the effective size is `base × userScale × osScale`, clamped by `fontPx` and `maxFontSizeMultiplier` (1.5). No layout uses a fixed height that clips at Extra large; the Maestro tour checks this.
- **AC-F-3** Given the app restarts, when it boots, then the saved scale (MMKV `app.font-scale`) is applied before the first screen renders, so there is no flash of default size.
- **AC-F-4** A live preview line on the Text size screen shows the selected size, and the screen meets the a11y rules: radio roles and the selected state.

### App icon (AC-I-*)
- **AC-I-1** Given Settings → App icon, when the user picks one of the bundled icons (Default plus 3 alternates), then the launcher icon changes:
  - on iOS through `setAlternateIconName`, with the system alert shown
  - on Android by enabling the matching `activity-alias` and disabling the others
- **AC-I-2** The chosen icon is persisted and the screen shows it as selected after a restart. Picking Default restores the primary icon.
- **AC-I-3** Alternate icons carry the per-environment badge (DEV/STG) like the primary icon. `scripts/native/icons.mjs` generates them deterministically from `src/assets/icons-source/alternates/*.png`.
- **AC-I-4** On platforms or builds where alternate icons are unsupported, the screen shows an explanation and no broken action.
- **AC-I-5** On Android, the switch does not kill the running app. The docs explain the known launcher behavior: shortcuts are removed and the icon may take a few seconds to update.

### Themes (AC-T-*)
- **AC-T-1** Given Settings → Theme, the user picks a mode (System, Light, Dark) and a palette (Default, Ocean, Forest, Sunset). Light and Dark are the Default palette. The 5 named themes are Light, Dark, Ocean, Forest and Sunset; each brand palette follows the mode.
- **AC-T-2** The theme changes at runtime through `UnistylesRuntime` without a remount, and is persisted in MMKV keys `app.theme` (mode) and `app.palette`.
- **AC-T-3** A unit test checks every text/background token pair of every palette variant (8 theme variants) against WCAG AA: 4.5:1 for text and 3:1 for large text and UI borders.
- **AC-T-4** Storybook's theme toolbar lists all variants.

### Languages (AC-L-*)
- **AC-L-1** The Language screen lists English, العربية, Español, Deutsch and Français, each in its own name. Picking one changes the language. A switch between LTR and RTL keeps the existing confirm-and-restart flow; a switch between two LTR languages applies without a restart.
- **AC-L-2** Every namespace exists for every language with identical key sets; `yarn i18n:check` enforces this. Plural forms follow CLDR: es/de/fr use `one`/`other`, and fr also has `many` where i18next requires it.
- **AC-L-3** Device-locale detection picks es, de or fr when the device uses it, and otherwise falls back to `en`.
- **AC-L-4** Dates, numbers and currency format through `Intl` in the active locale.
- **AC-L-5** The new translations are marked as drafts that need native review (a `TRANSLATIONS.md` table with a reviewer column) until a native speaker signs them off.

### CMS module (AC-C-*)
- **AC-C-1** With `cms` enabled, `src/services/cms/` exposes a `CmsClient` interface with `getEntries(type, { locale, limit, cursor })` and `getEntry(type, id, { locale })`, typed by Zod schemas. It also exposes TanStack Query hooks (`useCmsEntries`, `useCmsEntry`) with a key factory.
- **AC-C-2** Adapters are selected by `CMS_PROVIDER` (`tempo` | `sanity`). No adapter takes a token. Responses are validated with Zod, and a bad document is logged (redacted) and skipped, never a crash.
  - The `tempo` adapter (default) reads `GET /api/v1/content/:type` from `CMS_BASE_URL`, which defaults to `API_BASE_URL`. It follows the locale fallback and ETag caching. It asks for the app language; when the backend does not know that locale (400 on `locale`) it retries once with `en`.
  - The Sanity adapter reads the public GROQ API, using `CMS_PROJECT_ID`, `CMS_DATASET` and `CMS_API_VERSION`.
- **AC-C-3** A sample content screen ("What's new", reachable from Home) lists `announcement` entries in the active language, falling back to `en`. It has shimmer, empty and error states and pull-to-refresh.
- **AC-C-4** The content types and seed entries live in `template/backend/backend.json`, whose content locales cover all five app languages. Jest reads them through the backend test kit and dev builds through the local backend (the Mac app or `npx @rn-tempo/local-backend`). There is no in-app mock (T15.Z9).
- **AC-C-5** `tempo feature remove cms` removes the service, screen, route, env keys, locale groups and docs link, and the result passes `yarn verify`. The CLI e2e round-trip (remove, then add back, equals created-with) passes.
- **AC-C-6** Adding another provider is one file implementing `CmsClient`. A docs recipe shows Strapi and Contentful.
- **AC-C-7** An editor publishes an `announcement` in the local backend's Content tab. With the dev build pointed at the local backend, the app's "What's new" shows it in the active language after a pull-to-refresh.

## Out of scope
- Writing content from the app.
- Rich-text rendering beyond plain text plus links. A Portable Text recipe is in the docs.
- Per-user remote theme sync.
- Dynamic icons downloaded at runtime: iOS forbids them, and all icons must be bundled.

## Decided defaults (owner may still change them before the phase starts)
1. Alternate icons: Default plus "Dark", "Mono" and "Gradient" variants of the placeholder logo.
2. `cms` is off by default, like `dynamic-forms`. `app-icons` is on by default.
