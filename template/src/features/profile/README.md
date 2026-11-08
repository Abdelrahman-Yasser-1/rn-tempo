# Profile

## Purpose

Shows the signed-in user and lets them edit their details.

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `EditProfileScreen`: Form that updates first name, last name and email.
- `ProfileScreen`: The Profile tab root screen.

## Screens and routes

Routes of the Profile stack (`ProfileStackParamList`): `Profile` and `EditProfile`, under the `ProfileTab` tab.

## Data

The user itself comes from the auth feature (`useCurrentUser`). `api/profile.api.ts` sends `PUT /users/:id`, validated by `api/schemas.ts`; `useUpdateProfileMutation` updates the cached `authKeys.me()` optimistically and rolls back on failure.

## Spec

[`specs/profile/spec.md`](../../../specs/profile/spec.md), with its [design](../../../specs/profile/design.md) and [tasks](../../../specs/profile/tasks.md).
