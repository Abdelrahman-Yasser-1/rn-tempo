---
status: implemented
owner: rn-tempo
created: 2026-11-02
---

# Home

## Problem

Signed-in users need a landing screen that confirms who they are, surfaces connectivity problems and leads into the app's content.

## User stories

- As a signed-in user, I want a personal greeting, so that I know I am in my account.
- As a user on a bad connection, I want a clear offline banner, so that I understand stale data.
- As a developer using the samples module, I want an entry point to the items list.

## Acceptance criteria

- **AC-1** Given a signed-in user, when Home opens, then it greets the user by first name.
- **AC-2** Given the device is offline, when Home is shown, then the offline banner is visible.
- **AC-3** Given Home regains focus, when it was focused before, then the current user is refetched.
- **AC-4** Given the samples module, when the user taps Browse items, then ItemsList opens.

## Out of scope

- Dashboards or widgets beyond the greeting.

## Open questions

-
