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
   - **Strapi is an option** (owner, 2026-11-16): `--cms strapi` runs Strapi as an extra service instead of the portal's Content section. The portal's Content section stays the default.
   - External CMSs still work through `CmsClient` adapters in WS16: Sanity in the app; Strapi and Contentful as recipes.
10. **MSW handlers are generated from the endpoint definitions.** The template's hand-written handlers migrate one domain at a time, and the existing tests stay unchanged as the proof (Phase B).

## Layout
```
packages/
├── api-contract/   # @rn-tempo/api-contract: defineEndpoint/resource types + the C13 schemas
└── dev-api/        # @rn-tempo/dev-api: server, data generator, CLI (`tempo-api`), generators
apps/               # things people run or install, never imported or published to npm
└── dev-api-desktop/ # Tempo Dev API desktop app (Tauri 2 + React), shipped as GitHub release artifacts
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

## Tier 1b: Tempo Dev API desktop app (owner, 2026-11-17)
Daily use of the CLI (certs, trust, `.env.dev` edits, rebuilds, scenario commands) is too many steps. A desktop app wraps the **dev/mock API only**. It does not manage other project setup (envs, icons, CI), which stays in the `tempo` CLI.

### Decisions
- **Tauri 2** shell, with a React 19 + Vite + TanStack Query UI (the portal's stack). Lives in `apps/dev-api-desktop` (root `workspaces` gains `apps/*`; changesets ignore it). It is private (not on npm) and ships as GitHub release artifacts. macOS (arm64 and x64) comes first. Windows and Linux builds are best effort, and simulator trust is macOS-only.
- **The app holds no API logic.** It runs the `tempo-api` CLI and talks to the running server through its control API (`/__tempo/*`). Everything the app does is also possible from the CLI, and stays tested in Node.
- **Which dev-api runs:**
  - A project's own `node_modules/@rn-tempo/dev-api` when present. The app shows its version and warns when it is older than the app supports.
  - Otherwise, a bundled **standalone build** (`dist/standalone/tempo-api.mjs`, every dependency inlined).
- **Node:** Node ≥ 22 from the user's login shell (`$SHELL -lc 'command -v node'`), because macOS GUI apps do not get the shell `PATH`. A clear message appears when it is missing. No Node is bundled.
- **Projects:**
  - **Code projects:** any folder with `api/tempo-api.config.ts`, template-made or not. Endpoints are edited in code. The app runs, inspects and controls them.
  - **Standalone workspaces:** for a project without a config. The endpoint set is stored as JSON (`tempo-api.json`: method, path, status, response JSON Schema plus example, scenarios, auth) in the app data folder, or in a chosen folder.
    - Created by hand in the app, or imported from an OpenAPI 3.x file.
    - "Export to code" writes `api/tempo-api.config.ts` plus `api/endpoints/*.ts` into a project, so a workspace can graduate to code.
    - dev-api gains a JSON config loader for this.
- **Several projects can run at once**, each on its own port. The app keeps a recent-projects list.

### Screens
- **Projects sidebar** with status dots. A **menu bar (tray) item** lists the running servers with start/stop.
- **Overview:**
  - start/stop, HTTPS/HTTP, port
  - URLs for this Mac, the LAN, the Android emulator (`10.0.2.2`) and the iOS simulator
  - a QR code with the LAN URL
  - links to Swagger, OpenAPI and the Postman files
- **Endpoints:** a searchable list grouped by tag. Each endpoint has:
  - a live scenario picker
  - a "Try it" panel that sends a request and shows the response
  - in standalone workspaces, an editor
- **Requests:** a live log streamed from the server, redacted as the server log is, with filters (method, status, path) and request/response detail.
- **Data:** the stored `resource()` records, read-only, plus Reset.
- **Certificates:**
  - cert status (exists, expiry, covers the current LAN IP), with Create / Recreate
  - "Trust on this Mac (asks for your password)"
  - "Trust on iOS simulator" (lists the booted simulators)
  - "Push to Android emulator" with the install steps
  - a QR code to download the CA on a phone
- **Logs:** server stdout, with the server's redaction.

### dev-api additions (Node, tested)
- `GET /__tempo/info`: version, scheme, port, URLs, cert status, project name.
- `GET /__tempo/events`: a server-sent events stream of the request log, from a ring buffer of the last 500 entries, redacted. It requires the control token.
- `GET /__tempo/ca.pem`: the **public** root CA only, so a phone can download it. Never the key.
- `tempo-api dev ios|android`: creates certs when missing, trusts them on the booted simulator (or pushes them to the emulator), then runs `up`.
- The JSON config loader, `tempo-api import openapi <file>` and `tempo-api export code`.
- The standalone build target.

### App-side switch (template)
- The debug menu (non-prod only) gains **API source**:
  - **Env default:** today's behavior.
  - **In-app mocks.**
  - **Local dev API:** the per-platform default URL (iOS simulator `https://localhost:8443`, Android emulator `https://10.0.2.2:8443`), editable for a phone (LAN URL).
- It is stored in MMKV `app.api-source`, applies after an app restart (like the existing base-URL override), and needs no `.env` edit or rebuild.
- `client.ts` reads it in `__DEV__` only. Release bundles behave exactly as before (bundle check).

### Security
- The app opens no port of its own. It talks only to `127.0.0.1` servers, with the project's control token.
- Tauri capabilities are least privilege. The shell plugin is scoped to `node`, `mkcert`, `xcrun simctl` and `adb`, with fixed argument patterns.
- A strict CSP. No telemetry and no remote content.
- It never disables TLS verification. It trusts the project CA explicitly, as the CLI does.
- Builds are unsigned until the release phase (I). The docs explain the Gatekeeper "Open" step. Signing and notarization are added in Phase I.

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

### Strapi option (`--cms strapi`)
- **What it adds:**
  - a `strapi` service in Compose: Strapi 5, pinned, with its own database on the same Postgres server
  - seed content types matching the built-in ones (`announcement`, `help-article`), with i18n for the 5 languages
- **The app never calls Strapi directly.** The API's `/api/v1/content/*` turns into a pass-through to Strapi's REST API, with responses mapped to the same content shape and cached. So the app's `tempo` CMS adapter, the generated OpenAPI and the dev-api fixtures do not change.
- **Strapi keeps its own admin and its own logins.** The portal links to that admin and hides its own Content section.
- **What the Community edition lacks** compared with the built-in CMS:
  - no audit log
  - no built-in admin 2FA
  - no content history or rollback
  - no review workflows
  - no SSO (a paid add-on)

  The docs page states this plainly, and it lists the matching paid tiers as checked at implementation time.
- **Secrets:** Strapi's app keys and JWT secrets come from `.env.*` (never committed). The API token that the pass-through uses is read-only.

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
- **AC-DA-1** The desktop app opens the template folder (and any folder with `api/tempo-api.config.ts`), starts its dev API over HTTPS, and shows the Mac, LAN, emulator and simulator URLs plus a LAN QR code. Stop works, and quitting the app stops every server it started.
- **AC-DA-2** Choosing a scenario for an endpoint in the app changes the next response, and choosing "default" restores it, with no CLI command.
- **AC-DA-3** Requests from the iOS simulator app appear in the Requests view within a second, with tokens and passwords redacted.
- **AC-DA-4** From the Certificates screen, one action each creates the cert, trusts it on the booted iOS simulator, and pushes it to the Android emulator. Nothing changes this Mac's trust store unless the user picks "Trust on this Mac".
- **AC-DA-5** A standalone workspace made in the app (or imported from an OpenAPI file) serves its endpoints. "Export to code" produces a config that `tempo-api check` and `typecheck` accept in a fresh template copy.
- **AC-DA-6** With **API source → Local dev API** in the debug menu and an app restart, the template dev build talks to the dev API with `.env.dev` untouched. A release bundle contains no new code paths (bundle check).
- **AC-DA-7** Without Node ≥ 22, the app says so and links the install docs; it does not crash.

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

- **AC-B-13** With `--cms strapi`:
  - `docker compose --profile dev up` also starts Strapi.
  - An `announcement` published in the Strapi admin comes back from `GET /api/v1/content/announcement?locale=ar` in the same shape as the built-in CMS returns.
  - The app's "What's new" shows it with no app change.

## Out of scope
- Production hosting, managed databases, and secrets management beyond the recipe.
- Sending push notifications from the portal.
- SSO for the portal (recipe only).
- A visual page builder in the CMS.

## Open questions
None; the owner answered them on 2026-11-16.
