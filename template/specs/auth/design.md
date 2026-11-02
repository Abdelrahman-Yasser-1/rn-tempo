# Auth — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

Signed-out stack (`AuthStackParamList`): `Login`, `Register`, `ForgotPassword`,
`Otp { target, purpose: 'register' | 'reset-password' }`. Login links to Register and
ForgotPassword. Register and ForgotPassword navigate to Otp; a verified Otp resets the stack to
Login. Signing in flips the session gate and the navigator switches to Main (Home).

## Data/API

Every call goes through `request(config, ZodSchema)`.

- `POST /auth/login` `{username, password, expiresInMins: 60}` → user + `accessToken`, `refreshToken`.
- `GET /auth/me` → `User`. Query key `authKeys.me()`; `useMeQuery` syncs the result into the auth store.
- `POST /users/add` (register) → created user.
- `POST /auth/forgot-password` `{email}`, `POST /auth/otp/verify` `{target, code, purpose}`,
  `POST /auth/otp/resend` → `{success, retryAfterSec}`.

dummyjson has no forgot-password or OTP endpoints. These flows need `API_MOCKING=true`
(in-app mock adapter); the mock accepts the code `123456`.

## State

Session state lives in `useAuthStore` (not persisted; tokens only in the secure token store).
Server state is TanStack Query. Logout calls `signOut()`, which clears tokens and the query cache.
A failed refresh (401) signs the user out via the HTTP layer.

## Flags

None.

## i18n namespaces

`auth` (login, register, forgotPassword, otp), `validation` (`password.mismatch`), `errors`.

## a11y

Fields have labels; the inline login error uses `accessibilityRole="alert"` with a polite live
region. Headings use the header role. Resend announces its disabled state and remaining seconds.
Logical start/end layout keeps RTL correct.

## Analytics

None in the template.

## Risks

- Demo credentials in the dev hint are dummyjson's public account only; shown in mock/dev builds.
- OTP and reset flows are mock-only against the real demo backend.
