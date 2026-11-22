---
description: Typed, Zod-validated requests through @services/http, query key factories, mutations that invalidate, and the mock API defined once in api/.
globs: src/**/api/**,src/services/http/**,api/**
---

# API

Every request goes through `request()` with a Zod schema; every query has a key from a key factory; every mutation invalidates what it changed.

- Only `src/services/http/**` may import `axios`. Features never call `axios` or `fetch` directly.
- A screen that stays mounted under another one in a stack passes `useFocusNotifyOnChangeProps()` (`@shared/hooks`) as the query's `notifyOnChangeProps`, so it does not re-render while out of focus (see `useItemQuery`).
- `request<T>(config, schema: z.ZodType<T>): Promise<T>` (`@services/http/request`) validates the response with Zod. A parse failure becomes an `ApiError` with code `UNKNOWN`.
- Errors are `ApiError { status?, code, message, details? }` with `code` one of `NETWORK | TIMEOUT | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION | SERVER | UNKNOWN`. Use `normalizeError(e)` and `getErrorMessageKey(err)` (maps to the `errors` i18n namespace) from `@services/http/errors`. Never show raw server messages. `ApiError.isOperational` (and `StorageError.isOperational`) is true for expected runtime failures (offline, timeout, 4xx, 5xx) and false for bugs such as a response that does not match its schema; log caught errors with `logError` (`@services/logger/logger`), which warns for operational errors and errors for bugs.
- Feature API layout (`src/features/<name>/api/`): `<name>.api.ts` (request functions), `schemas.ts` (Zod schemas and inferred types), `keys.ts` (key factory), `queries.ts` (`useQuery` hooks), `mutations.ts` (`useMutation` hooks).
- Add `api/schemas.ts` as a plain Zod module (no React Native import): it is what the mock definitions import.
- Derive types from schemas with `z.infer`; do not hand-write DTO types.
- 401 handling (single-flight refresh, retry once) is in the HTTP client. Do not reimplement it.
- The API is dummyjson-compatible. Endpoints in the contract: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /users/add`, `PUT /users/:id`, `GET /products?limit=&skip=`, `GET /products/search?q=`, `GET /products/:id`, `POST /products/add`, plus mock-only `/auth/forgot-password`, `/auth/otp/verify`, `/auth/otp/resend` and `/app-config`. Their mock is defined once, in `api/endpoints/*.ts` (see below).

```ts
// ✅ keys.ts
export const itemKeys = {
  all: ['items'] as const,
  list: (params: { limit: number; skip: number }) => [...itemKeys.all, 'list', params] as const,
  detail: (itemId: number) => [...itemKeys.all, 'detail', itemId] as const,
};

// ✅ items.api.ts
export function getItem(itemId: number): Promise<Item> {
  return request({ method: 'GET', url: `/products/${itemId}` }, itemSchema);
}

// ✅ queries.ts
export function useItem(itemId: number) {
  return useQuery({ queryKey: itemKeys.detail(itemId), queryFn: () => getItem(itemId) });
}

// ✅ mutations.ts: invalidate the affected keys
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  });
}
```

```ts
// ❌ raw axios / fetch, unvalidated response, inline key, no invalidation
import axios from 'axios';
const { data } = await axios.get(`/products/${itemId}`);
useQuery({ queryKey: ['item', itemId], queryFn: () => fetch(url).then((r) => r.json()) });
```

## The mock API (`api/`)

> **Deprecated.** The code-defined mocks (`api/endpoints`, `yarn api`, the MSW handlers, the in-app mock mode and `tempo g endpoint`) are replaced by the Tempo Local Backend: `backend/backend.json`, edited in the app (see `backend/README.md` and the docs page "Migrate from the dev API"). They still work and stay the default until the owner confirms the switch; they are removed only after that. For a new endpoint keep following the steps below until then, and also add it to `backend/` (`yarn backend:check` compares the two).

Mock endpoints are defined once, with `@rn-tempo/api-contract`, in `api/endpoints/<domain>.ts` and listed in `api/tempo-api.config.ts`. Three things read them: the dev server (`yarn api up`), the Jest MSW handlers (`api/generated/msw-handlers.ts`) and the in-app mock mode (`API_MOCKING=true`). Do not write a mock for one of these endpoints anywhere else, and never hand-edit `api/generated/`.

- After adding or changing an endpoint run `yarn api generate`; `yarn api:check` (part of `yarn verify`) fails on stale output.
- New endpoint: `yarn tempo g endpoint <feature>.<name>`, or copy the pattern of `api/endpoints/products.ts`.
- Give the C13 endpoints a deterministic `data` function (fixed values). Never rely on generated data there: the app bundle must not contain faker.
- Import schemas from plain modules only (`@features/<name>/api/schemas`, `@features/<name>/types`, `@shared/utils/schemas`), never a feature barrel. `api/` is loaded by Node; ESLint boundaries and `yarn api:check` enforce this.
- Errors: throw `ApiError(status, message)` from `data`. Wrap endpoints of an optional module in its `@tempo-feature:<name>` markers, in the endpoint file and in the config.

```ts
// api/endpoints/items.ts
export const getItem = defineEndpoint({
  method: 'GET',
  path: '/items/:id',
  params: z.object({ id: z.string() }),
  response: ItemSchema,
  data: ({ params }) => items.find((item) => item.id === Number(params.id)) ?? notFound(params.id),
});
```
