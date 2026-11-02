---
status: implemented
owner: rn-tempo
created: 2026-11-02
---

# Settings

## Problem

Users need one place to change language and theme, see build details and sign out.

## User stories

- As a user, I want to pick my language, so that the app speaks it.
- As a user, I want to choose light, dark or system theme.
- As a developer, I want a hidden debug menu in non-prod builds.
- As a user, I want to log out safely, with a confirmation.

## Acceptance criteria

- **AC-1** Given Settings, when it opens, then Language, Theme, About and Log out rows are shown.
- **AC-2** Given the Language screen, when a different language is picked, then a confirm dialog shows and confirming applies it.
- **AC-3** Given the Theme screen, when System, Light or Dark is picked, then the preference applies immediately.
- **AC-4** Given About in a non-prod build, when the version label is tapped 5 times within 3 s, then DebugMenu opens.
- **AC-5** Given Log out, when confirmed in the dialog, then the user is signed out.

## Out of scope

- Notification preferences.
- Account deletion.

## Open questions

-
