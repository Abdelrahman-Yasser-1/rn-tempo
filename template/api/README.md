# API definitions

> **Deprecated.** The code-defined mocks described here (`api/endpoints`, `yarn api`, the generated MSW handlers, the in-app mock mode and `tempo g endpoint`) are replaced by the Tempo Local Backend: a real API in `backend/` that you edit in an app, and that `yarn test:backend` runs the whole Jest suite against. Nothing here is removed yet: it stays the default and keeps working until the project owner confirms the switch, and removal comes only after that. To move over, see "Migrate from the dev API" in the docs (Backend section) and `backend/README.md`.

The app's backend contract (C13), written once with `@rn-tempo/api-contract`. Everything else is built from it:

| Consumer                                       | How it reads the definitions                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `yarn api up`                                  | Serves them as a local mock server, with Swagger UI at `/docs`.           |
| Jest                                           | `api/generated/msw-handlers.ts` answers from them (`src/test-utils/msw`). |
| Dev mock mode (`API_MOCKING=true`)             | `src/services/http/devMockAdapter.ts` answers from them inside the app.   |
| `api/generated/openapi.json`, `postman.*.json` | Generated documentation.                                                  |

Nobody writes a mock for one of these endpoints anywhere else.

## Layout

- `tempo-api.config.ts`: lists the endpoints.
- `endpoints/<domain>.ts`: one file per domain (`auth`, `authExtra`, `users`, `products`, `appConfig`).
- `generated/`: output of `yarn api generate`. Never edit it by hand.

## Commands

```sh
yarn api up            # start the mock server in the background (prints a QR code for a phone)
yarn api status | logs | down | reset
yarn api generate      # rewrite api/generated after changing an endpoint
yarn api:check         # fails when api/generated is out of date (part of yarn verify)
yarn tempo g endpoint <feature>.<name>   # scaffold an endpoint, its API call and hook
```

`yarn api` runs the `@rn-tempo/dev-api` command from `node_modules`. `yarn tempo` does the same for the `create-tempo-app` CLI. In the rn-tempo repository, build both once at the repository root first: `yarn build:tools`.

## Rules

- **Deterministic data.** The C13 endpoints have a `data` function that returns fixed values (`Product N` with a fixed price, one demo user, fixed tokens). Many tests assert those values. They never use random generation, so faker is never in the app bundle.
- **Plain schema imports.** The config is loaded by Node, not React Native. Import schemas from plain modules (`@features/items/api/schemas`, `@features/auth/api/schemas`, `@shared/utils/schemas`), never from a feature barrel (`@features/items`), which pulls in screens. ESLint enforces this, and `yarn api:check` fails if something slips through.
- **Feature modules.** Endpoints of an optional module are wrapped in its `@tempo-feature:<name>` markers (items is `samples`), so removing the module removes them. After removing one, run `yarn api generate`.
- **Errors.** Throw `ApiError(status, message)` from a `data` function. The response is problem+json with a `message` field, which the app's error normalizer reads.

Documentation: the docs site, Backend > Dev API, and Guides > Add an endpoint.

Prefer a real HTTPS server with a database, sign-in, uploads and a request log, run from a desktop app? Follow the step-by-step guide at Backend > Local Backend (`docs/content/docs/backend/local-backend.mdx`). It also shows how to point this app at it with the debug menu's API source.
