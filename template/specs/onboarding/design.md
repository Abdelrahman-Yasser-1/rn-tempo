# Onboarding — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

`Onboarding` is the first screen of the signed-out stack, registered in its own group with
`if: useShouldShowOnboarding`. When the hook turns false (completed), the group unmounts and
the next group (Login) renders. Deep link path comes from `LINK_PATHS.Onboarding`.

## Data/API

None.

## State

`useOnboardingStore` (Zustand, not persisted by middleware): `isCompleted: boolean | undefined`
(undefined until read, because storage is not ready at import time) and `complete()`, which writes
`STORAGE_KEYS.onboardingCompleted` to MMKV, then updates the store. `useShouldShowOnboarding` combines
the flag, the store value and the stored value.

## Flags

`onboardingEnabled` (default true).

## i18n namespaces

`app` under `onboarding.*` (slide titles and bodies, skip, next, get started, dots label). No new
namespace, to avoid changing the namespace contract.

## a11y

Slide titles use the header role; page dots expose `accessibilityState.selected`; Skip, Next and
Get started are labelled buttons. Horizontal paging uses logical direction, so it works in RTL.

## Analytics

None.

## Risks

- A flag flip mid-session unmounts the screen; completion is only written by explicit user action.
