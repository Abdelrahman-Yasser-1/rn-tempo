---
status: approved
owner: rn-tempo
created: 2026-11-02
---

# Profile

## Problem

Users cannot see or correct the personal details the app holds about them.

## User stories

- As a signed-in user, I want to see my avatar, name and email, so that I can confirm my account.
- As a user, I want to edit my name and email, so that my details stay correct.
- As a user on a flaky network, I want failed edits rolled back, so that the screen never shows data the server rejected.

## Acceptance criteria

- **AC-1** Given a signed-in user, when Profile opens, then avatar, full name and email are shown.
- **AC-2** Given invalid input, when EditProfile is submitted, then field validation errors show and no request is sent.
- **AC-3** Given valid input, when saved, then the profile updates optimistically and the user returns to Profile.
- **AC-4** Given the update request fails, when saved, then the optimistic change is rolled back and an error toast shows.

## Out of scope

- Avatar upload.
- Password change.

## Open questions

-
