# Auth

## Purpose

Sign in, register, reset a password and verify a one-time code, and own the session state (`signedOut`, `signedIn`, a pending deep link).

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `ForgotPasswordScreen`: Request a reset code.
- `LoginScreen`: Email and password sign in.
- `OtpScreen`: Enter the code sent for registration or a password reset.
- `RegisterScreen`: Create an account.
- `authKeys`: Query key factory (`authKeys.me()`).
- `useMeQuery`: Loads the signed-in user.
- `useAuthStatus`: Selector hook for the session status.
- `useCurrentUser`: Selector hook for the current user.
- `useLogout`: Signs out and clears the session.
- `useAuthStore`: Zustand store `{ status, user, pendingLink }`. Not persisted; tokens live in `@services/secure-storage`.
- `AuthStatus`: Type of the session status.
- `UserSchema`: Zod schema of a user.
- `User`: Type of a user.

## Screens and routes

Routes of the Auth stack (`AuthStackParamList`): `Login`, `Register`, `ForgotPassword` and `Otp` (params `target`, `purpose`). `Onboarding` belongs to the onboarding feature.

## Data

Requests in `api/auth.api.ts`, validated by `api/schemas.ts`: `POST /auth/login`, `GET /auth/me`, `POST /users/add`, `POST /auth/forgot-password`, `POST /auth/otp/verify`, `POST /auth/otp/resend`. Mutations (`useLoginMutation`, `useRegisterMutation`, `useForgotPasswordMutation`, `useVerifyOtpMutation`, `useResendOtpMutation`) are in `api/mutations.ts`; the only query is `me`, keyed by `authKeys.me()`.

## Spec

[`specs/auth/spec.md`](../../../specs/auth/spec.md), with its [design](../../../specs/auth/design.md) and [tasks](../../../specs/auth/tasks.md).
