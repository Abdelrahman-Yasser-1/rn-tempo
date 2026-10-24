---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS3 — App core infrastructure (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/src/{app,navigation,services,theme,config,test-utils}/**`, `template/src/locales/**`, `template/index.js`, `template/jest.config.js`, `template/jest.setup.ts`, `template/__mocks__/**`.

## Acceptance criteria
- **AC-1** a sample test renders a `Text` through `renderWithProviders` and an MSW-mocked request resolves.
- **AC-2** theme switching works at runtime without remounting; scaling unit tests cover the clamps.
- **AC-3** unit tests cover the storage init order, the logger level filter, the initial-language resolution, and a mocked RTL restart path.
- **AC-4** MSW tests cover:
- **AC-5** unit tests cover hydrate/set/clear and the store transitions.
- **AC-6** unit tests (mocking the libs) cover the enabled, disabled, prod and dev matrices.
- **AC-7** 
- **AC-8** a unit test with mocked steps covers the ordering and each failure branch.
- **AC-9** a cold start on dev with mocks lands on Login, and signing in with `emilys/emilyspass` reaches the Home placeholder.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

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
