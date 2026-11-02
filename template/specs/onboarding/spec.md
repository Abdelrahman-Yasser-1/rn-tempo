---
status: implemented
owner: rn-tempo
created: 2026-11-02
---

# Onboarding

## Problem

First-time users land on a login form with no introduction to the app. Teams want a short, skippable
intro that is shown once and can be switched off.

## User stories

- As a first-time user, I want a short intro, so that I understand what the app does.
- As a user in a hurry, I want to skip it, so that I reach Login quickly.
- As a product owner, I want to disable onboarding with a flag, so that I can ship without it.

## Acceptance criteria

- **AC-1** Given onboarding is enabled and not completed, when a signed-out user opens the app, then onboarding shows first.
- **AC-2** Given onboarding, when the user taps Skip or Get started, then completion is persisted and Login shows.
- **AC-3** Given onboarding was completed or the `onboardingEnabled` flag is off, when the app opens, then Login shows directly.

## Out of scope

- Remote-controlled slide content.
- Showing onboarding again after sign-out.

## Open questions

-
