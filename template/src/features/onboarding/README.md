# Onboarding

## Purpose

The first-run walkthrough, shown once. Completion is stored in MMKV (`app.onboarding-completed`).

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `useShouldShowOnboarding`: True until the user completes onboarding; the auth navigator uses it to pick its first route.
- `OnboardingScreen`: The walkthrough slides.

## Screens and routes

Route `Onboarding` of the Auth stack (`AuthStackParamList`).

## Data

No requests. `store/onboarding.store.ts` holds `isCompleted` in memory and writes the flag to storage through `@services/storage`.

## Spec

[`specs/onboarding/spec.md`](../../../specs/onboarding/spec.md), with its [design](../../../specs/onboarding/design.md) and [tasks](../../../specs/onboarding/tasks.md).
