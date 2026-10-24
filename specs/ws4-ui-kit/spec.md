---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS4 — UI kit, hooks, utils, Storybook (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/src/shared/**`, `template/.rnstorybook/**`, `template/src/assets/{icons,images,animations}/**`, the storybook scripts, and `metro.config.js` (storybook wrapper only).

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

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
