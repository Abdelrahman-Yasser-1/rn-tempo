# Items

## Purpose

The reference feature for server data: a paged, searchable list, a detail view and a create form.

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `ItemCreateScreen`: Form that creates an item.
- `ItemDetailsScreen`: One item, with retry and back handling.
- `ItemsListScreen`: Debounced search over a paged list.
- `Item`: Type of an item.

## Screens and routes

Routes of the Home stack: `ItemsList`, `ItemDetails` (param `itemId`) and `ItemCreate`. They exist only when the samples module is enabled.

## Data

Requests in `api/items.api.ts`: `GET /products` and `/products/search` (paged by `skip`), `GET /products/:id`, `POST /products/add`. Hooks in `api/queries.ts` (`useItemsInfiniteQuery`, `useItemQuery`, both accept `notifyOnChangeProps` so a covered screen does not re-render) and `api/mutations.ts` (`useCreateItemMutation`). Keys come from `itemKeys` in `api/keys.ts`.

## Spec

[`specs/items/spec.md`](../../../specs/items/spec.md), with its [design](../../../specs/items/design.md) and [tasks](../../../specs/items/tasks.md).
