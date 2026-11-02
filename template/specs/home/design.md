# Home — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

`Home` is the root of the Home tab stack (`HomeStackParamList`). Browse items navigates to `ItemsList` (samples module only). Deep link path from `LINK_PATHS.Home`.

## Data/API

Reuses `useMeQuery()` from `@features/auth` (`GET /auth/me`, key `authKeys.me()`). No new endpoints.

## State

Server state only. The name falls back to the auth store user, then to a generic greeting.

## Flags

None.

## i18n namespaces

`home` namespace: `title`, `greeting` (`{{name}}`), `greetingFallback`, `browseItems`, `browseItemsHint`.

## a11y

Header and greeting use the header role; the Browse items card is a labelled button; the offline banner is announced.

## Analytics

None.

## Risks

- Refetch on focus can flicker the greeting; the cached value is shown while refetching.
