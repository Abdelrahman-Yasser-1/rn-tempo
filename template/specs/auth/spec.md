---
status: in-progress
owner: rn-tempo
created: 2026-11-02
---

# Auth

## Problem

People need to create an account, sign in, recover access and sign out. Sessions must survive app
restarts and expire safely. Today the signed-out stack shows placeholder screens only.

## User stories

- As a returning user, I want to sign in with my username and password, so that I reach my data.
- As a new user, I want to register and verify a one-time code, so that I can create an account.
- As a user who forgot a password, I want a reset code by email, so that I can regain access.
- As a signed-in user, I want to log out, so that nobody else can use my session.

## Acceptance criteria

- **AC-1** Given valid credentials, when the user submits Login, then tokens are stored and the app shows Home.
- **AC-2** Given a wrong password, when the user submits Login, then an invalid-credentials error is shown.
- **AC-3** Given the device is offline, when the user submits Login, then the offline error is shown and no request is sent.
- **AC-4** Given the OTP screen just opened, when the countdown is running, then Resend is disabled until it reaches 0.
- **AC-5** Given a signed-in user, when they log out, then tokens and the query cache are cleared and Login shows.
- **AC-6** Given an expired session, when token refresh fails with 401, then the user is signed out.
- **AC-7** Given the Register form is valid, when submitted, then the user goes to Otp with purpose `register`.
- **AC-8** Given a valid email on ForgotPassword, when submitted, then the user goes to Otp with purpose `reset-password`.
- **AC-9** Given the code 123456, when verified on Otp, then a success toast shows and the user returns to Login.

## Out of scope

- Social login, biometrics and passkeys.
- Setting a new password after the reset code (the backend has no such endpoint).
- Real OTP delivery: the demo backend has no OTP endpoints, the mock API accepts only 123456.

## Open questions

-
