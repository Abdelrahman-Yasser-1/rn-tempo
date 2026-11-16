---
status: approved
owner: implementer, reviewed by the integrator
created: 2026-11-16
plan: ../PLAN.md
---

# WS15 — Dev API package, local backend and admin portal (Wave 4, after WS14)

WS15 has two tiers that share one endpoint contract format.

1. **`@rn-tempo/dev-api`**: a dev dependency in every project.
   - You declare endpoints with Zod request and response shapes.
   - It serves random or fixed data over local HTTPS, with commands to start and stop it.
   - It generates OpenAPI, Postman collections and the MSW handlers used by app tests.
2. **Full backend**: a Node + Express API with PostgreSQL and a React + Vite admin portal with role-based access. The portal includes the CMS as its Content section.

WS16 (settings customization and CMS) builds on the backend's content API.

## Problem

The template talks to dummyjson, which is read-mostly and keeps nothing, or to hand-written MSW mocks. Teams need four things those cannot give:
- **Before the backend exists:** a way to build screens against the endpoints they expect, with realistic responses they can switch (empty list, 404, slow).
- **One contract** that the app, the test mocks, the docs and the API collections all come from.
- **A backend they own**, with a safe admin dashboard for app config, flags, users and content.
- **HTTPS on a phone**, which ATS on iOS, network-security config on Android and SSL pinning all expect.

## Decisions (owner, 2026-11-16)

1. **Stack:** Node + Express in this monorepo.
   - dev, staging and prod environments
   - versioned APIs
   - Swagger/OpenAPI and API collections are generated, never written by hand
   - Docker images
2. **Portal access levels:** not everyone is an admin.
3. **Local HTTPS** so the mobile app uses the API safely.
4. **Two tiers:**
   - The dev-API package is a dev dependency with `up`/`down` commands.
   - A project adds its endpoints with request and response shapes.
   - It returns random data, or the data the user sets.
5. **Package name** `@rn-tempo/dev-api`; commands run under `yarn api …`.
6. **Both options:**
   - New projects get `@rn-tempo/dev-api` by default.
   - `create-tempo-app --with-backend` also copies the full backend and portal into the project.
7. **Database:** Prisma + PostgreSQL.
8. **Portal stack:** React + Vite SPA.
   - It is served as static files, so there is no Node server in production.
   - The API is the only place access is enforced.
9. **CMS lives inside the portal**, as its Content section, under the same roles and audit log.
   - Strapi is not used.
   - External CMSs still work through `CmsClient` adapters in WS16: Sanity in the app; Strapi and Contentful as recipes.
10. **MSW handlers are generated from the endpoint definitions.** The template's hand-written handlers migrate one domain at a time, and the existing tests stay unchanged as the proof (Phase B).

## Layout
```
packages/
├── api-contract/   # @rn-tempo/api-contract: defineEndpoint/resource types + the C13 schemas
└── dev-api/        # @rn-tempo/dev-api: server, data generator, CLI (`tempo-api`), generators
backend/
├── api/            # @rn-tempo/api: Express 5 + Prisma + PostgreSQL
├── portal/         # @rn-tempo/portal: React + Vite + TanStack Query + React Router
└── docker/         # Dockerfiles, compose.yaml, Caddyfile, certs/ (gitignored)
template/api/       # the app's endpoint definitions (dev-api reads them)
```

## Tier 1: `@rn-tempo/dev-api`

### Endpoint contract (`@rn-tempo/api-contract`)
```ts
export const getProduct = defineEndpoint({
  method: 'GET',
  path: '/v1/products/:id',
  params: z.object({ id: z.coerce.number() }),
  response: ItemSchema,
  // optional: omit for random data generated from the schema
  data: ({ params, db }) => db.products.get(params.id),
  scenarios: { notFound: { status: 404 }, slow: { delayMs: 3000 }, serverError: { status: 500 } },
});
export const products = resource('products', ItemSchema, { seed: 50, searchBy: ['title'] });
```
- `resource()` expands to list (with `limit`/`skip`/`q` paging and search), get, create, update and delete. Data persists in `.tempo-api/db.json`, which is gitignored.
- The C13 endpoints ship as ready definitions in `template/api/endpoints/`.

### Commands (`tempo-api` binary; exposed in the template as `yarn api …`)
| Command | Does |
|---|---|
| `yarn api up [--port 8443] [--http]` | Starts in the background (pid file in `.tempo-api/`). Prints the HTTPS URL, the LAN URL and a QR code for a phone. |
| `yarn api down` | Stops it. |
| `yarn api status`, `yarn api logs [-f]` | Shows state and logs. Logs are redacted like the app logger. |
| `yarn api reset` | Re-seeds the stored data. |
| `yarn api scenario set <endpoint> <name>` / `clear` | Switches a response live. |
| `yarn api openapi`, `yarn api collections`, `yarn api msw` | Writes `api/generated/{openapi.json, postman.json, msw-handlers.ts}`. |

### Behavior
- **Random data:**
  - Generated from the Zod response schema with a seeded generator, so the same request returns the same data.
  - Field-name heuristics give realistic values for `email`, `phone`, `image`/`thumbnail`, `price`, `firstName` and `createdAt`.
  - `.describe()` or `.meta({ example })` overrides a field.
- **Fixed data:** a `data` value or function, or `api/fixtures/<endpoint>.json`, wins over random data.
- **Scenarios:** chosen per request with the `x-tempo-scenario` header, or globally with `yarn api scenario set`.
- **Request validation:** params, query and body are checked against their schemas. A bad request gets a 400 problem+json response that names the field.
- **Auth helper:**
  - `auth: 'bearer'` on an endpoint requires a token from the built-in mock login.
  - The mock login and refresh use the C13 login/refresh shapes.
  - The mock OTP is `123456`.
- **HTTPS:** uses the same mkcert certificates as tier 2 (see Local HTTPS). `--http` is for the iOS simulator on localhost only.
- **Generated outputs:**
  - OpenAPI 3.1, with Swagger UI at `/docs`.
  - A Postman collection plus an environment.
  - MSW handlers.
  - All are deterministic, and `yarn api:check` fails when one is stale.
- **Generator:** `tempo g endpoint <feature>.<name> [--resource]` creates the definition, the feature's API call and query hook, and wires the handler.

### MSW migration
- Generated handlers (`api/generated/msw-handlers.ts`) replace `src/test-utils/msw/handlers/*` one domain at a time: auth, products, users, app-config, otp.
- Each domain is one commit. The domain's existing tests must pass unchanged, which proves the behavior did not change.
- Test-only overrides stay possible with `server.use(...)`.
- Dev mock mode (`API_MOCKING=true`) uses the same generated handlers.

## Tier 2: full backend and portal

### API (`backend/api`)
- **Base:** Express 5 + TypeScript (ESM), built with tsdown, tested with vitest + supertest.
- **Environments:**
  - A Zod `env.ts` validates dev, staging and prod, and fails fast on a bad value.
  - Only `.env.example` and `.env.dev` (no secrets) are committed.
- **Versioning:**
  - URL prefix `/api/v1`, with one router folder per version.
  - A retired version sends `Deprecation` and `Sunset` headers before removal.
  - Policy: ADR-016.
- **Shared contract:** routes are built from the same `defineEndpoint` definitions as tier 1. So OpenAPI, collections and request validation come from one source, and moving from dev-api to the real API keeps the definitions.
- **Data:** Prisma + PostgreSQL, with migrations and a seed: the `emilys` user, products, app-config and sample content.
- **Security:**
  - Middleware: `helmet`, CORS limited to the portal origin, rate limits on auth, a body size limit.
  - Passwords hashed with argon2id.
  - Short-lived access tokens, plus rotating refresh tokens with reuse detection.
  - `pino` logs redact tokens, passwords, OTP codes, phone numbers and emails.
  - One problem+json error shape, with no stack traces in prod.
- **Swagger UI:** at `/docs` in dev and staging; 404 in prod.

### Portal (`backend/portal`, React + Vite SPA)
- **Sign-in:**
  - Admin auth uses httpOnly, Secure, SameSite=strict cookies, plus CSRF protection.
  - TOTP is mandatory for every account.
  - 5 failed attempts lock the account for 15 minutes.
  - Accounts are invite-only, with single-use invites that expire.
- **Access levels** (least privilege). Permissions are `resource:action` strings that the API checks on every route. The portal hides what a role cannot use, but it is never the guard.

  | Role | Can |
  |---|---|
  | `owner` | everything, incl. managing admins and roles; created only by `yarn api:bootstrap-owner`, no route can grant it |
  | `admin` | users, app-config, feature flags, content types and content; not admins or roles |
  | `editor` | content entries only: create, edit, publish, schedule |
  | `support` | read users, revoke a user's sessions; no config or content |
  | `viewer` | read-only dashboards, content and audit log |
- **Pages:**
  - Overview.
  - Users: search, view, disable, revoke sessions.
  - App config: min/latest versions, maintenance, store URLs.
  - Feature flags.
  - **Content** (the CMS).
  - Admins and roles (owner only).
  - Audit log: who, what and when, with before/after diffs that redact secrets.
  - Dev API (optional): view the endpoints and switch scenarios on a running dev-api.
- **Languages:** en + ar (RTL), with string keys.

### CMS (the portal's Content section)
- **Content types**, e.g. `announcement` and `help-article`:
  - Admins define their fields: text, rich text, image, link, date, boolean, select.
  - Seed types ship ready to use.
- **Entries:**
  - One version per locale (en, ar, es, de, fr).
  - Draft → published, with optional `publishAt` and `expireAt`.
  - Every save keeps a version, so a published edit can be rolled back.
  - The editor previews before publishing.
- **Media:** a local volume in dev; S3-compatible storage through an adapter. File type and size are validated.
- **Read API:**
  - `GET /api/v1/content/:type` and `/:type/:id`, public and read-only.
  - Returns published entries only.
  - `?locale=` with an en fallback.
  - Cache headers and ETag.
- **App side:** reads content through the `tempo` adapter of `CmsClient` (WS16).

### Local HTTPS
- `yarn backend:certs` uses mkcert to create a local CA and a certificate for `api.tempo.test`, `portal.tempo.test`, `dev-api.tempo.test`, `localhost` and the LAN IP.
- Caddy terminates TLS in Docker. The dev-api uses the certificates directly.
- **iOS simulator:** a script adds the CA with `xcrun simctl keychain booted add-root-cert`.
- **Android:**
  - The dev flavor gets a `network_security_config` that trusts user CAs; staging and prod never do.
  - A guide covers installing the CA on the emulator and on devices.
- **Physical iOS devices:** a profile-install guide.
- **Pinning:** the ssl-pinning module documents pinning the local cert, or keeping pinning off in dev.

### Docker
- Multi-stage images for the API and the portal:
  - They run as non-root.
  - They have health checks.
  - The portal is a static build served by Caddy.
- Compose profiles:
  - `dev`: API with watch, the portal's Vite dev server, Postgres and Caddy.
  - `prod-like`: the built images, Postgres and Caddy.
- A GHCR build-and-push workflow, plus a deployment recipe. Cloud hosting is out of scope.

### CLI and monorepo
- **Scopes:** `api`, `portal`, `api-contract`, `dev-api`, `backend`, `docker`.
- **CI jobs:**
  - packages (dev-api, api-contract)
  - API: lint, typecheck, test, generated-file staleness, Docker build
  - portal: lint, typecheck, test, build
- **create-tempo-app:**
  - It always adds `@rn-tempo/dev-api` and `template/api/`.
  - `--with-backend` also copies `backend/` and wires its scripts.
  - `.tempo.json` records `backend: true|false`.

## Acceptance criteria

### Dev API (AC-D-*)
- **AC-D-1** `yarn api up` in the template starts the server in the background and prints the HTTPS and LAN URLs. `yarn api down` stops it, and `status` reports both states correctly.
- **AC-D-2** An endpoint without `data` returns schema-valid random data, and the same request returns the same data. An endpoint with `data` or a fixture returns exactly that.
- **AC-D-3** A request that violates the request schema returns 400 problem+json naming the field.
- **AC-D-4** `x-tempo-scenario: notFound`, or `yarn api scenario set`, switches the response. `clear` restores it.
- **AC-D-5** `resource()` list, get, create, update and delete work. Data persists across `down`/`up`, and `reset` re-seeds it.
- **AC-D-6** The template dev build with `API_BASE_URL` set to dev-api works end-to-end over HTTPS on the iOS simulator and the Android emulator: login, refresh, items, profile edit, app-config.
- **AC-D-7** `yarn api openapi`, `collections` and `msw` are deterministic, and `yarn api:check` fails on a stale file.
- **AC-D-8** After the migration, `src/test-utils/msw/handlers` holds no hand-written copy of a C13 endpoint, and all template tests pass unchanged.
- **AC-D-9** `tempo g endpoint items.favorite` creates a definition, an API call and a query that pass `yarn verify`.

### Backend (AC-B-*)
- **AC-B-1** `docker compose --profile dev up` starts the API, portal, Postgres and Caddy. The health route (`GET /api/v1/health` on host `api.tempo.test`, port 8443) answers 200 with a trusted cert.
- **AC-B-2** Every C13 endpoint exists under `/api/v1`, and the template's response schemas parse every response (contract test).
- **AC-B-3** OpenAPI and collections are generated and checked for staleness in CI. Swagger UI returns 404 in prod.
- **AC-B-4** An unknown version returns 404. A deprecated version carries `Deprecation` and `Sunset` headers.
- **AC-B-5** Each role can do exactly what its row allows. An API test matrix asserts allow and deny for every role × permission.
- **AC-B-6** Portal sign-in requires TOTP and lockout works. Every write is in the audit log with its actor, and secrets in diffs are redacted.
- **AC-B-7** Only the bootstrap CLI can create an `owner`.
- **AC-B-8** Logs never contain passwords, tokens, OTP codes, phone numbers or emails.
- **AC-B-9** Images run as non-root, pass a Trivy scan with no critical CVEs, and pass their health checks.
- **AC-B-10** An editor creates an `announcement` with ar and en versions and publishes it.
  - The read API returns it per locale, with the en fallback.
  - It is not returned before `publishAt` or after `expireAt`.
  - A rollback restores the previous version.
- **AC-B-11** An editor cannot open users, config, flags or roles in the portal, and the API answers 403 to direct calls.
- **AC-B-12** `create-tempo-app Demo --with-backend --yes` creates a project whose backend starts with `docker compose --profile dev up`, and whose app passes `yarn verify`.

## Out of scope
- Production hosting, managed databases, and secrets management beyond the recipe.
- Sending push notifications from the portal.
- SSO for the portal (recipe only).
- A visual page builder in the CMS.

## Open questions
None; the owner answered them on 2026-11-16.
