# WS15 tasks

Format: `- [ ] T<id> (AC…) <summary>`, followed by its commit and its docs page.
- Each task updates its docs in the same PR (amendment 53).
- Each phase is one branch and one PR, created from an up-to-date `main`. Push every commit as it is made (amendment 52).
- Check every library's API and version against its current docs while implementing, then pin it exactly.

## Phase A: contract and dev API core (`ws15/a-dev-api`)
- [x] **T15.A1** Add the workspaces `packages/api-contract` and `packages/dev-api`, and the commitlint scopes.
  - Commits: `chore(repo): add api contract and dev api packages`, `feat(commitlint-config): add backend scopes`.
- [x] **T15.A2** (AC-D-3) `defineEndpoint` and `resource` types, plus request validation.
  - Commit: `feat(api-contract): add endpoint definition format`.
- [x] **T15.A3** (AC-D-2) Seeded random data from Zod schemas.
  - Includes the field-name heuristics, `meta` examples, fixed `data` and fixture files.
  - Commit: `feat(dev-api): generate data from schemas`.
- [x] **T15.A4** (AC-D-4, AC-D-5) Server.
  - Express, scenarios, `resource` CRUD stored in `.tempo-api/db.json`, and the mock auth helper.
  - Commit: `feat(dev-api): add mock server`.
- [x] **T15.A5** (AC-D-1) `tempo-api` CLI with up, down, status, logs, reset and scenario.
  - Runs in the background with a pid file and prints a QR code.
  - Commit: `feat(dev-api): add up and down commands`.
  - Docs: `backend/dev-api`.

## Phase B: generators and template switch (`ws15/b-dev-api-template`)
- [x] **T15.B1** (AC-D-7) Generators and `yarn api:check`.
  - OpenAPI 3.1 with Swagger UI, a Postman collection and environment, and MSW handlers.
  - Commit: `feat(dev-api): generate openapi collections and msw handlers`.
- [x] **T15.B2** C13 definitions in `template/api/endpoints/`, the `yarn api` scripts, and `.tempo-api/` in `.gitignore`.
  - Commit: `feat(template): define the app api with dev-api`.
- [x] **T15.B3** (AC-D-8) Move the MSW handlers to the generated ones, one domain per commit, with tests unchanged.
  - Commits: `refactor(test): generate <domain> msw handlers`.
- [ ] **T15.B4** (AC-D-9) The `tempo g endpoint` generator, with templates and a snapshot test.
  - Commit: `feat(cli): add endpoint generator`.
  - Docs: `backend/dev-api` (endpoints, scenarios, generators) and `guides/add-an-endpoint`.

## Phase C: local HTTPS (`ws15/c-https`)
- [ ] **T15.C1** `yarn backend:certs` with mkcert, used by both dev-api and Caddy.
  - Commit: `feat(dev-api): serve over local https`.
- [ ] **T15.C2** (AC-D-6) Native trust of the local CA in dev builds.
  - A dev-only Android `network_security_config`.
  - An iOS simulator CA script.
  - A commented dev-api `API_BASE_URL` in `.env.dev`, and pinning notes.
  - Commit: `feat(native): trust the local dev ca in dev builds`.
- [ ] **T15.C3** (AC-D-6) Device run over HTTPS on the iOS simulator and the Android emulator, with screenshots in the PR.
  - Docs: `backend/local-https`.

## Phase D: backend API foundation (`ws15/d-api`)
- [ ] **T15.D1** (AC-B-8) `backend/api` skeleton.
  - env for dev, staging and prod; `pino` with redaction; helmet, CORS and limits; problem+json; `/api/v1/health`.
  - Commit: `feat(api): add express skeleton`.
- [ ] **T15.D2** (AC-B-4) Version routers and deprecation headers.
  - Commit: `feat(api): add versioned routing`.
  - Docs: ADR `016-api-versioning`.
- [ ] **T15.D3** Prisma and Postgres, migrations, and a seed (emilys, products, app-config, content).
  - Commit: `feat(api): add prisma schema and seed`.
- [ ] **T15.D4** (AC-B-2, AC-B-8) Auth and the C13 endpoints, built from the shared definitions.
  - argon2id, refresh-token rotation with reuse detection, and rate limits.
  - Commits: `feat(api): add auth endpoints`, `feat(api): add users products and app config`.
- [ ] **T15.D5** (AC-B-2, AC-B-3) Contract test against the template schemas, OpenAPI and collections, Swagger hidden in prod, and the CI job.
  - Commits: `test(api): check responses against the app contract`, `ci(backend): add api pipeline`.
  - Docs: `backend/api`.

## Phase E: Docker (`ws15/e-docker`)
- [ ] **T15.E1** (AC-B-1, AC-B-9) Dockerfiles, the `compose.yaml` profiles `dev` and `prod-like`, and the Caddyfile.
  - Commit: `feat(docker): add images and compose`.
- [ ] **T15.E2** Trivy scan in CI and a GHCR build-and-push workflow.
  - Commit: `ci(backend): scan and publish images`.
  - Docs: `backend/docker` and `recipes/deploy-backend`.

## Phase F: portal access (`ws15/f-portal-auth`)
- [ ] **T15.F1** (AC-B-5, AC-B-7) Admins, roles and permissions, the enforcement middleware, and `yarn api:bootstrap-owner`.
  - Commit: `feat(api): add admin roles and permissions`.
- [ ] **T15.F2** (AC-B-6) Admin auth: cookies, CSRF, mandatory TOTP, lockout and invites.
  - Commit: `feat(api): add admin authentication with totp`.
- [ ] **T15.F3** (AC-B-6) Audit log with redacted diffs.
  - Commit: `feat(api): add audit log`.
- [ ] **T15.F4** (AC-B-5, AC-B-11) Role × permission test matrix.
  - Commit: `test(api): cover every role and permission`.
  - Docs: `backend/portal-access`.

## Phase G: portal UI (`ws15/g-portal`)
- [ ] **T15.G1** Vite + React shell.
  - Sign-in with TOTP, a navigation menu that shows only what the role may use, en/ar (RTL), and a CI job.
  - Commits: `feat(portal): add portal shell and sign-in`, `ci(backend): add portal pipeline`.
- [ ] **T15.G2** Pages: overview, users, app config, flags, admins and roles, and audit log.
  - Commits: one per 1–2 pages, `feat(portal): add <page> page`.
- [ ] **T15.G3** Optional Dev API page.
  - Commit: `feat(portal): add dev api page`.
  - Docs: `backend/portal`.

## Phase H: CMS in the portal (`ws15/h-cms`)
- [ ] **T15.H1** (AC-B-10) Content types and fields, plus per-locale entries.
  - Also draft/publish, scheduling, versions and media upload.
  - Commit: `feat(api): add content types and entries`.
- [ ] **T15.H2** (AC-B-10) Public read API: published entries only, locale fallback, ETag.
  - Commit: `feat(api): add public content read api`.
- [ ] **T15.H3** (AC-B-10, AC-B-11) Portal Content section.
  - Admins get the type editor.
  - Editors get the entry editor, preview, publish/schedule, and history with rollback.
  - Commits: `feat(portal): add content editor`, `feat(portal): add content types editor`.
  - Docs: `backend/cms`.

## Phase H2: Strapi option (`ws15/h2-strapi`)
- [ ] **T15.H4** (AC-B-13) Strapi 5 service in Compose, behind a profile or option, with a seed of content types and locales.
  - Commit: `feat(docker): add optional strapi service`.
- [ ] **T15.H5** (AC-B-13) Content pass-through in the API (`CMS_SOURCE=builtin|strapi`):
  - map Strapi responses to the content shape
  - cache them
  - run a contract test against both sources
  - Commit: `feat(api): serve content from strapi when selected`.
- [ ] **T15.H6** Portal hides its Content section and links to the Strapi admin when Strapi is selected.
  - Commit: `feat(portal): link to strapi when it is the cms`.
  - Docs: `backend/cms-strapi` (setup, what Community lacks, how to switch back).

## Phase I: CLI (`ws15/i-cli`)
- [ ] **T15.I1** `create-tempo-app` always adds `@rn-tempo/dev-api` and `api/`. It also gets the option `--cms builtin|strapi`, which applies with `--with-backend` and records `cms` in `.tempo.json`.
  - `--with-backend` copies `backend/` and wires its scripts, and `.tempo.json` gets `backend`.
  - Commit: `feat(cli): add dev api and backend options`.
- [ ] **T15.I2** (AC-B-12, AC-B-13) CLI e2e cases for `--with-backend` and `--with-backend --cms strapi`.
  - Commit: `test(cli): create a project with the backend`.
  - Docs: `cli/create` and `getting-started/backend`.
