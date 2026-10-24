---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS9 — Features (Wave 2; after WS3 + WS4)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/src/features/{auth,home,profile,settings,onboarding,items}/**` (the auth store is already there from WS3), `src/test-utils/msw/handlers/{users,products,auth-extra}.ts`, `src/locales/*/{auth,home,profile,settings,items}.json`, `template/specs/{auth,home,profile,settings,onboarding,items}/**`.

## Acceptance criteria
- **AC-1** `yarn verify` passes; coverage ≥ 70% on `features/`; a manual run on both platforms in en and ar (RTL) and light/dark, with screenshots in the PR.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

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
