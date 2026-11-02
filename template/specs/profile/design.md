# Profile — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

`Profile` is the root of the Profile tab stack; `EditProfile` is pushed from it and returns with `goBack()` after saving.

## Data/API

`PUT /users/:id` validated by `UserSchema`; `UpdateProfileSchema` = firstName, lastName, email. Mutation updates `authKeys.me()` and the auth store optimistically.

## State

Optimistic update via `onMutate` snapshot and `setQueryData`; `onError` restores the snapshot. No invalidation on settle because dummyjson does not persist edits and a refetch would undo them.

## Flags

None.

## i18n namespaces

`profile` namespace: `title`, `editTitle`, `edit`, `firstName`, `lastName`, `email`, `save`, `avatarLabel`. Validation messages come from `validation`; errors from `errors`.

## a11y

Headers use the header role; avatar has a label; form fields are labelled; the save button shows a loading state.

## Analytics

None.

## Risks

- Optimistic data can briefly differ from the server; rollback covers failures.
