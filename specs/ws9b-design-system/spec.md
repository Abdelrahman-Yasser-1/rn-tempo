---
status: draft
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
| `~/GoMoney/icons/{outline,filled}` | The icon catalogue. These are Tabler Icons, MIT, 1,847 SVGs, 24×24, `currentColor` |
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
   - **Bundle-size rule:** the full catalogue lives **outside `src/`** at `template/assets-catalog/icons/{outline,filled}` and is never bundled. Only icons copied into `src/assets/icons/` (by `yarn icons:add <name> [--filled]`) are generated and bundled.
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
| C | Icon pipeline and catalogue: `assets.mjs`, `icons:add`, the `Icon` rework, RTL mirroring, Lucide removal |
| D | Component upgrades: Button, TextField family, Toast, Header, Select, Loader, Card, ListItem, EmptyState, Image |
| E | New display and navigation components |
| F | New input components and `Form*` wrappers |
| G | Pickers and calendar (date, time, month, time slot) |
| H | Optional modules: `webview`, `file-picker`, `maps` |
| I | Hardening: logger redaction, `skip401Urls`, logical-properties lint, keyboard-controller, per-feature error boundary, shake debug menu with network logger, vendored AI skills |

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
- **AC-3** `yarn icons:add <name> [--filled]` copies from the catalogue. `yarn assets` / `yarn assets:check` validate and generate. Only `src/assets/icons` is bundled. Directional icons mirror in RTL. The Tabler license ships with the catalogue.
- **AC-4** Every row in the mapping above is implemented, recipe'd or skipped as stated. Each component has a story, a test and a11y props, and is RTL-safe.
- **AC-5** The optional modules (`webview`, `file-picker`, `maps`) add or remove cleanly via the CLI. The `packages/cli` e2e round-trip passes.
- **AC-6** Every PR passes `yarn verify` plus a Maestro device tour on iOS and Android (en + ar, light + dark) before it is ready (amendment 46).

## Out of scope

- Official DGA token packages. None was found; tokens come from the MOS Saudi palette.
- Redesigning WS9 feature flows beyond restyling.
