# Items — design

Spec: [`spec.md`](spec.md)

## Screens & navigation

Routes in `HomeStackParamList`: `ItemsList`, `ItemDetails { itemId: number }`, `ItemCreate`. `ItemsList` opens from the Home "Browse items" card; rows open `ItemDetails`; the header plus button opens `ItemCreate` (hidden when the flag is off). Deep link paths come from `LINK_PATHS`. This whole feature is the `samples` module and sits between `@tempo-feature:samples` markers.

## Data/API

- `GET /products?limit=20&skip=N` for the plain list and `GET /products/search?q=&limit=20&skip=N` when the search text is not empty. Both return `{ products, total, skip, limit }` (`ItemsPageSchema`).
- `GET /products/:id` returns an `Item`; `POST /products/add` creates one (dummyjson echoes it back and does not persist).
- Query keys (`itemKeys`): `all`, `lists()`, `list({ q })`, `details()`, `detail(id)`.
- `useItemsInfiniteQuery(q)` uses `useInfiniteQuery` with `initialPageParam: 0`; the next param is `skip + limit` while it is below `total`.
- `useCreateItemMutation` invalidates `itemKeys.lists()` on success and shows a success toast.

## State

Server state only (TanStack Query). The search text is local screen state, debounced by 300 ms before it reaches the query key.

## Flags

`itemsCreateEnabled` (default `true`): hides the create button and turns `ItemCreate` into an unavailable state.

## i18n namespaces

`items` namespace: `list.*` (title, search placeholder, empty state, create label), `details.*` (price, rating, stock, category labels), `create.*` (form labels, submit, success toast, unavailable state).

## a11y

Rows are buttons with the title as label; headers use the header role; the search field and create button carry labels; the shimmer is hidden from screen readers by the shared components.

## Analytics

None.

## Risks

- dummyjson does not persist created items, so a refetch after create will not show them; the invalidation still demonstrates the pattern.
- The mock API (`API_MOCKING=true`) serves 100 deterministic items for offline development and tests.
