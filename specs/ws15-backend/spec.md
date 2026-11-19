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

## Tier 1c: Tempo Local Backend app (owner, 2026-11-17; supersedes the app parts of Tier 1b)
The desktop app becomes an **independent local backend**: no code project and no Node install needed. A backend is a folder holding JSON definitions. The app runs it as a real HTTPS server with a database, auth, media and an admin dashboard. The template app (or any app) talks to it like a real backend. Tier 1b's dev-api additions (X1–X3) stay; the app's "open a code project" mode is dropped. Code-defined mocks remain in the CLI (`yarn api`) and Jest.

### Decisions
- **Name and location:** "Tempo Local Backend", in `apps/local-backend` (the X4–X6 shell is moved and reworked).
- **Engine:**
  - A TypeScript server in `apps/local-backend/engine`, reusing `@rn-tempo/dev-api` pieces (redaction, certs, the OpenAPI writer).
  - Shipped inside the app as a **Node single executable (SEA) sidecar**, so nothing else needs installing. The app is about 90 MB.
- **Database:** **SQLite** through the built-in `node:sqlite`, so there is no native addon (SEA-friendly). One file per backend: `.data/db.sqlite`. Writes are transactional.
- **Backend folder (user-chosen, e.g. `rn-tempo/local-backend/`):**
  ```
  backend.json        # name, port, https, auth settings, collections, endpoints, content types (committable)
  handlers/*.js       # optional custom handlers (committable)
  seed/*.json         # optional seed data (committable)
  .data/              # db.sqlite, media/, secrets.json, logs/ (gitignored, never committed)
  ```
  - A `.gitignore` inside `.data/` is created automatically.
  - **Snapshot:** export or import one `.zip` (definitions + data + media).
- **Endpoint types (no code):**

  | Type | Behavior |
  |---|---|
  | `crud` | Bound to a collection: list (paging with `limit`/`skip` or `page`, sort, filter by field, search `q`), get, create, update (PUT/PATCH), delete. Per-endpoint field visibility and an auth requirement. |
  | `static` | A fixed status, headers and JSON body, with scenarios. |
  | `auth` | login, refresh, me, logout, register, forgot-password, otp verify/resend, against the built-in **app users**. |
  | `upload` / `download` | Multipart upload of any file type; download/stream with the right content type and range support. |
  | `handler` | A JavaScript function file `handlers/<name>.js`, given `{ req, db, media, auth, log }`. It runs in a worker thread with a timeout. The docs state it is **not** a security sandbox: only open backends you trust. |

  Every endpoint can have scenarios (status, delay, body), as in dev-api.
- **Collections:** typed fields (string, number, boolean, date, enum, json, relation, media), required/unique, defaults, and seed data. Changing a field updates the table (add/rename/remove with a confirm step).
- **Changes apply live:** saving an endpoint, collection or data hot-reloads the engine without a restart. The mobile app sees the change on its next request.
- **Auth:**
  - App users are stored in SQLite with scrypt password hashes.
  - JWT (HS256) access and refresh tokens, with the secret per backend in `.data/secrets.json`.
  - Configurable token lifetimes. Refresh tokens are rotated and revocable.
  - Token shapes compatible with the template (C13).
- **Media:**
  - Any file type. Default max 100 MB per file, configurable.
  - Stored under `.data/media/` with generated ids; original names are kept only as metadata.
  - The content type is detected from the bytes.
  - `Content-Disposition: attachment` for anything but images, video and audio.
  - No path is taken from user input.
- **HTTPS:**
  - Reuses the mkcert flow (create, trust on Mac/simulator/emulator, CA QR for phones).
  - HTTP is optional.
  - The API port binds on all interfaces so phones work.
  - **The admin channel never does:** the dashboard talks to the engine over a separate `127.0.0.1` admin port with a per-launch token, proxied through Rust.
- **Logs:**
  - Every request and response, redacted (passwords, tokens, secrets), filterable, with a detail view.
  - Engine logs and handler `log` output.
  - Kept in `.data/logs/` with rotation.
  - Export as JSON.
- **Contract:**
  - The engine serves OpenAPI 3.1 and Swagger UI for each backend, generated from its definitions.
  - "Check against an OpenAPI file" compares a backend with the template's `api/generated/openapi.json` and lists missing endpoints and shape mismatches.
- **Template preset:**
  - "New backend → Tempo template" creates every C13 endpoint (login, refresh, me, users add/update, products list/search/get/add, app-config, forgot-password, OTP) with seeded data matching today's mocks (emilys/emilyspass, 100 products).
  - Adding a product or editing the profile persists and shows in the app.
  - The template reaches it through the debug menu's API source → Local dev API.
- **Content (CMS):**
  - Content types with typed fields and per-locale entries (the template's languages), draft/published states, and scheduled publish.
  - Served read-only by `GET /content/:type?locale=` and `GET /content/:type/:id`, in the same shape the WS16 `tempo` CMS adapter reads.

### Dashboard (UI)
Simple first: one window, a left list of backends, and per backend 8 tabs with plain words.

| Tab | Contents |
|---|---|
| Dashboard | Start/Stop and the addresses with a QR code; cards for requests/min, error rate, slowest endpoints, records per collection, media storage. |
| Endpoints | A list with method, path and type. Add, edit, duplicate, delete. A form per type, a scenario picker, and "Try it". |
| Data | Collections. A table to browse, search, add, edit and delete rows. Edit fields; import/export JSON and CSV. "Open database file" reveals `db.sqlite`. |
| Media | A grid/list with preview (images, video, audio, PDF), upload (drag & drop), download, delete, copy URL. |
| Users | App users: add, reset password, disable, sign out everywhere (revoke tokens). |
| Content | Content types and entries per locale, draft/publish/schedule. |
| Logs | Live requests plus engine logs, filters, detail, export. |
| Settings | Port, HTTPS/HTTP, certificates (create, trust Mac/simulator/emulator, phone QR), auth token lifetimes, media limits, snapshot export/import, OpenAPI contract check. |

- Every destructive action asks for confirmation.
- Empty states explain the next step in one sentence.
- Light/dark follows the system.

### Security
- All the Tier 1b rules still apply:
  - fixed Rust commands
  - a strict CSP
  - Rust proxying with only the backend CA trusted
  - safe reveal/save of files
  - no TLS bypass
- **The admin API is localhost-only, with a token; the public API never exposes admin routes.**
- No secrets in `backend.json`. `.data/` stays gitignored.
- Redaction everywhere logs or the UI show request bodies.
- Handler code runs only from the backend folder the user opened.

## Tier 1d: Tempo Local Backend as a platform (owner, 2026-11-19)
One engine runs three ways, and projects need no mock code or mock data. It extends Tier 1c.

### Run modes
| Mode | Start | Notes |
|---|---|---|
| Desktop app | open the app | as Tier 1c; also does certificate trust for simulators/emulators |
| Local web | `npx @rn-tempo/local-backend` | the engine serves the same React dashboard in the browser; admin on `127.0.0.1` only; any OS |
| Team server | Docker image `ghcr.io/<owner>/tempo-local-backend` + compose with Caddy | shared by the team and CI over HTTPS with real certificates |

- **One UI codebase.** The dashboard talks to the engine through a transport layer: Tauri IPC (desktop) or HTTPS with a session cookie (web).
- **Web sessions:**
  - `HttpOnly` + `Secure` + `SameSite=Strict` cookie, plus a CSRF token.
  - The local web login is a one-time code printed by the CLI; it is never a token in a URL.
- **Multiple backends per server** (projects), each with its own folder, database, media and public base path `/b/<backend>/...`.

### Team server security (absorbs the Phase D/E portal admin scope)
- **Accounts and roles:**
  - Roles per backend: `owner` (server owner is created from the CLI only), `admin`, `editor`, `viewer`.
  - argon2id or scrypt hashing, optional TOTP, lockout and rate limits.
- **API keys:**
  - Per backend, with scopes `read-definition` (test kit), `sessions` (CI), `admin`.
  - Shown once and stored hashed; revocable.
- **Audit log** of every admin write: who, what, before/after summary.
- **HTTPS:** Caddy with automatic certificates (public domain) or internal CA. The engine listens on HTTP only inside the Docker network.
- **Public mock APIs** are unauthenticated by default. Each backend can require an access key header for its public API, for private team servers.

### No mock data in projects
- **Template and generated projects** keep only a URL (`API_BASE_URL`) and, for tests, a backend reference (`TEMPO_BACKEND=<server URL>/b/<name>` + a read-only API key in CI secrets).
- **Test kit** `@rn-tempo/local-backend/test` (Jest setup, one line):
  1. Downloads the backend definition + seed + small media (snapshot without secrets or sessions) using the `read-definition` key, and caches it in `node_modules/.cache/tempo-backend/` with an ETag. Offline after the first fetch. A committed folder is also accepted as the source.
  2. Starts the engine **in memory** inside the Jest process on a random localhost port and points the app's HTTP client at it (real HTTP, no interception). Each test file gets a fresh isolated copy.
  3. **Test mode is the default:**
     - no delays
     - no random faults
     - fixed clock and seed
     - deterministic data
   - Developers can opt into configured delays/faults per suite or test.
  4. Helpers: `backend.scenario(endpointId, name)`, `backend.time.set(...)`, `backend.data.insert(...)`, `backend.reset()`, and `backend.requests()` to assert calls.
- **CI E2E sessions:** `POST /b/<name>/__sessions` (`sessions` key) creates a temporary isolated copy with its own URL. It is deleted on `DELETE` or after its TTL. Parallel runs never share data.
- **Old mocks are kept** (`template/api`, `yarn api`, in-app mock mode, MSW handlers) until the owner confirms the new path. The docs mark them **deprecated** with the migration steps; removal is a later step after confirmation.

### OpenAPI / Swagger import and sync
- **Import sources:** a file (drag & drop) or a URL. Formats: OpenAPI 3.0/3.1 (JSON/YAML) and Swagger 2.0, which is converted on import.
- **Per operation, an endpoint is created with:**
  - path, method, parameters, request body schema (validated, 400 on mismatch) and tags
  - **each documented response as a scenario**
  - examples from the file, or deterministic generated data
  - auth from the security schemes
- **Sync:** re-import shows a diff (added, changed, removed endpoints) to review. Local customizations are kept unless the user chooses to overwrite them.
- **Dashboard:** request/response schemas and examples per endpoint.

### Response customization
- **Delays:** a global default plus a per-endpoint fixed delay or random range. Network presets: Instant, Fast Wi-Fi, 4G, Slow 3G, Timeout. Download/upload throttling.
- **Shared base response:**
  - A backend-level success wrapper (e.g. `{ success, data, message, meta }`), error format (problem+json, dummyjson, custom) and common headers.
  - **Reusable response templates.**
  - Per-endpoint opt-out and override. The Tempo template preset uses no wrapper (C13).
- **Editing a response:** Form and JSON tabs edit the same value. The JSON tab is **Monaco** with formatting, validation, schema autocomplete, folding, diff vs last saved, and themes. It runs offline, with the CSP allowing its workers.
- **Dynamic values in responses:** `{{params.x}}`, `{{query.x}}`, `{{body.x}}`, `{{headers.x}}`, `{{user.id}}`, `{{now}}`, `{{uuid}}`, `{{seq}}`, and seeded fake data helpers. Logic-less (no code execution); handlers remain the place for code.

### Realtime and other protocols
- **SSE endpoints:** scripted message sequences with delays, broadcasting on data changes (`collection.created`, `updated`, `deleted`), and manual send from the dashboard.
- **WebSocket endpoints:** echo, scripted replies by message match, broadcast on data changes, manual send, and a connected clients list.
- **GraphQL:**
  - An SDL upload or schema built from collections.
  - Queries and mutations resolved from collections, with handler resolvers allowed.
  - Subscriptions over WebSocket (graphql-ws protocol).
  - A GraphiQL page.
- **Webhooks:**
  - Outgoing calls on events (data changes, custom triggers from handlers), with delay, retries with backoff, signing secret (HMAC) and a delivery log.
  - An incoming **inbox** URL that captures and shows any request sent to it.
- **Push notification test sender:**
  - Send FCM (HTTP v1, service account) and APNs (token auth .p8) test pushes to a device token from the dashboard.
  - Credentials are stored in the backend's `.data/secrets` (never exported or committed) and redacted everywhere.
- **Fault and limit simulation:**
  - Rate limits (429 + `Retry-After`)
  - random failure percentage
  - timeouts, dropped connections, offline (refuse connections)
  - slow upload/download
  - CORS settings
  - cookie/session auth mode
  - an OAuth2 / social-login mock (authorize, token, userinfo)

### Packaging
One npm package `@rn-tempo/local-backend` (engine + web dashboard + test kit), the Docker image, and the macOS app. `packages/api-contract` and `packages/dev-api` stay until the old mocks are removed, then they are retired.

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
- **AC-LB-1** On a Mac with no Node installed, the app creates a backend from the "Tempo template" preset and starts it over HTTPS. The template dev build (API source → Local dev API) logs in as emilys, lists products, adds a product, which then appears in the list after a reload, and edits the profile, which persists across an engine restart.
- **AC-LB-2** Adding, editing and deleting an endpoint or a collection field in the app takes effect on the next request, without a restart.
- **AC-LB-3** Records added, edited or deleted in the Data tab are returned by the API immediately, and survive quitting the app.
- **AC-LB-4** Uploading a file of any type (image, video, PDF, zip) through the API or the Media tab, then downloading it, returns identical bytes with a correct content type. Oversized files get 413.
- **AC-LB-5** A `handler` endpoint runs its JS with `db` access. An infinite loop is stopped by the timeout with a 500 and a log entry; the engine keeps serving.
- **AC-LB-6** The Logs tab shows each request live with passwords and tokens redacted. Admin routes are unreachable on the LAN address.
- **AC-LB-7** Publishing a content entry in Content makes it appear from `GET /content/:type?locale=ar`; unpublishing hides it.
- **AC-LB-8** The OpenAPI contract check against the template's `openapi.json` reports no differences for the preset.
- **AC-LB-9** Snapshot export, then import into a new folder, reproduces definitions, data and media.
- **AC-LP-1** `npx @rn-tempo/local-backend` opens the dashboard in a browser on Linux/macOS/Windows with the same tabs as the desktop app; the admin API is unreachable from the LAN.
- **AC-LP-2** On the team server, a viewer cannot change anything (403), an editor can, every write appears in the audit log, and the server runs over HTTPS behind Caddy.
- **AC-LP-3** A project with only `TEMPO_BACKEND` and a read-only key runs its Jest suite with no mock files. The engine runs in memory in test mode (no delays, fixed data), with isolated data per test file, and works offline after the first run.
- **AC-LP-4** Two parallel CI runs each create a session, write data, and never see each other's writes; sessions expire after their TTL.
- **AC-LP-5** Importing a Swagger 2.0 and an OpenAPI 3.1 file creates endpoints whose scenarios match each documented response. Re-importing a changed file shows a diff and keeps local customizations.
- **AC-LP-6** A per-endpoint random delay range, the shared success wrapper, and `{{params.id}}` in a response all take effect live. Test mode ignores the delays unless opted in.
- **AC-LP-7** SSE and WebSocket clients receive a message when a record is created. A GraphQL query returns collection data, and a subscription receives the create.
- **AC-LP-8** A webhook fires on a record create with an HMAC signature and retries on failure. The inbox shows a captured request.
- **AC-LP-9** A test push is delivered to a real device token (owner check). The credentials never appear in logs, snapshots or exports.
- **AC-LP-10** The rate limit returns 429 with `Retry-After`. A 50% failure setting fails about half of 200 requests. The OAuth2 mock completes an authorization-code flow.

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
