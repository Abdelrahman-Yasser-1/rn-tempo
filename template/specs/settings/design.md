# Settings — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

`Settings` is the Settings tab root; it pushes `Language`, `Theme` and `About`. The secret tap on About opens `DebugMenu` through `navigationRef` (non-prod only).

## Data/API

None.

## State

Language via `useLanguage()` and theme preference via `useAppTheme()` (both persisted by their services). The secret tap counter is local hook state.

## Flags

None; the debug menu is gated by `APP_ENV !== 'prod'`.

## i18n namespaces

`settings` namespace: `title`, rows, `language.*` (native language names, restart dialog), `theme.*`, `about.*`, `logout.*`.

## a11y

Rows are buttons with labels; radio groups expose selected state; dialogs trap focus; destructive action is marked.

## Analytics

None.

## Risks

- Changing language can require an RTL reload; the confirm dialog warns the user.
