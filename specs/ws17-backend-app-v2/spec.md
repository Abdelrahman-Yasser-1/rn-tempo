# WS17: Mockyard (the Local Backend app, v2)

Status: **Phase A done. The design and name are chosen. The build phases B–K are planned below** (amendment 62).

## Goal
Turn the Tempo Local Backend into **Mockyard**, a standalone, production-ready desktop app that any developer can use with any framework. Mockyard runs local backends, mocks and CMS content. It sends requests like Postman. AI agents drive it over MCP. Backends can be shared with a public link. It lives in this monorepo until it moves to its own repository.

## Decisions
- **2026-11-24 (owner):** the round 1 designs (Workbench, Console, Inspector) are rejected. The new designs follow Postman's familiar layout.
- **2026-11-24 (owner):** every feature in `research.md` is in scope ("all features now"), the Now and Next items alike. The Skip items stay skipped.
- **2026-11-24 (owner, round 2 and 3 feedback):**
  - Home is the start screen.
  - Projects open as top-level tabs, and several can run at once.
  - Actions are selection-based: no hover-revealed buttons. Each item also has a context menu and keyboard shortcuts.
  - The layout stays simple.
  - A Devices view shows each simulator, emulator, physical device and browser with its CA trust state.
  - The app is framework-agnostic.
  - Colours use the soft slate palette (`#485E78` family).
- **2026-11-24 (owner): any of the three round 3 directions is acceptable. Claude picked 2 · Studio** (`designs/2-studio.html`):
  - The endpoint tab is a split view: Mock on the left, Try on the right (the full Postman request builder), and Recent hits at the bottom.
  - The sidebar has the bands Build · Test · Observe · System.
  - It also takes two parts of the other directions: Familiar's option to show the Mock pane full width on narrow windows, and Hub's right context bar (closed by default).
- **2026-11-24 (owner): new name.** The app is not tied to Tempo, so Claude chose **Mockyard**.
  - **Availability:** the name `mockyard` and the `@mockyard` scope were both free on npm, and GitHub had only five small repos with the name.
  - **Owner to confirm before T17.B1:** the domain and the trademark check, which set the bundle id. The runner-up was **Localyard**.
- **2026-11-24 (owner): new feature, share links.** A backend can be shared with people who are not on the same network, the way VS Code forwards ports (phase I).
- **2026-11-24 (owner): the app moves to its own repository soon.** Phase K prepares the move. Until then, nothing in the app may import from `template/` or depend on Tempo-only packages.

## Product rules (every phase)
- **Familiar UI:** Postman-familiar desktop density (13 px base text, 28–32 px rows), soft slate light and dark themes, WCAG AA contrast, and visible focus.
- **Actions:** selection-based actions, plus a context menu, keyboard shortcuts and Undo toasts. No hover-only controls.
- **Two kinds of tabs:** project tabs (in the title bar) and request tabs (in the workbench) look clearly different. Each project keeps its own tabs, sidebar and environment.
- **Compatible:** the existing backend folders (`backend.json`, `handlers/`, `seed/`, `.data/`) and the engine's admin and public APIs stay compatible. Existing users' backends open without changes.
- **Safe for agents:** every AI-agent write goes through the same permission and snapshot rules as the UI.
- **Contracts first:** each phase starts by fixing its contracts (types, schemas, admin API routes) and tests, then builds the UI. One PR per phase, small commits, and docs in the same PR (amendments 52 and 53).

## Information architecture (Studio)
- **Title bar:** project tabs (Home is pinned first), "+", and the Running manager.
- **Header:** back and forward, the project switcher with Start/Stop and the device QR, search (⌘K), Share, notifications, theme, settings and account.
- **Home:** Projects, Devices, Running now, Get started, and Recent.
- **Project sidebar:**
  - **Build:** Endpoints, Data, Content, Media, Users.
  - **Test:** Requests, Environments, Runner, History.
  - **Observe:** Traffic, Inbox, Agent activity.
  - **System:** Devices, Simulate, Proxy, Snapshots, Share, AI & MCP, Settings.
- **Workbench:** request and endpoint tabs, and the environment selector with quick look. The right context bar has Info, Code, Variables, Docs and Agent.
- **Footer:** Console, Runner, Cookies, Vault and Trash, plus the CA, Proxy, Share and MCP status, the project state, and layout toggles.
- **Native menu bar:** Mockyard, File, Edit, View, Backend, Request, Window and Help, as in the designs. It is a Tauri menu. The web dashboard mode shows the same actions in the command palette (⇧⌘P).

## Phases
Each phase is a branch `ws17/<letter>-<slug>` with one PR. The phase order follows dependencies. Codex implements each phase from a brief, and Claude reviews it and runs native builds and the full checks.

### Phase B: rename to Mockyard and set the boundary (`ws17/b-rename`)
- [ ] **T17.B1** Rename the product:
  - the app name, window title, menus and About box
  - the Tauri `productName` and bundle id (the owner confirms the domain)
  - the icon, as a new original app icon
  - the package names: `@rn-tempo/local-backend*` become `mockyard` (the CLI and engine) and `@mockyard/*`
  - the CLI binary `mockyard` (`serve`, `mcp`, `run`, `doctor`)
  - environment variables: `TEMPO_*` becomes `MOCKYARD_*`, and the old names are read with a deprecation warning
  - the config and data directories: on first launch, copy the old Tempo app-support data with a one-time notice
- [ ] **T17.B2** Compatibility:
  - Existing `backend.json` files open as they are.
  - The template's `yarn backend`, test kit and docs point at the new package names. The old names keep working as aliases until WS14.
  - CI is updated.
- [ ] **T17.B3** Boundary check: a lint rule and a CI check that fail if `apps/local-backend/**` imports from `template/`, `packages/cli` or any other `@rn-tempo/*` package except approved shared configs (eslint, tsconfig, prettier). List what Phase K must copy.
- [ ] **T17.B4** ADR `017-mockyard`: the name, the scope, the repo move plan, and the compatibility promises. Update the docs and README, and add the commitlint scope `mockyard`.

### Phase C: design system and app shell (`ws17/c-shell`)
- [ ] **T17.C1** Design tokens from `designs/2-studio.html`:
  - the slate palette, light and dark, with contrast tests like the template's token tests
  - the type scale (17/13/12/11 px), spacing, radii, separators, and the method and status colours
  - the system font stack
- [ ] **T17.C2** Core components with tests:
  - **Lists and tabs:** `ListRow` with the selection model (single, ⌘ and ⇧ multi-select, a selection bar), `ContextMenu` (with right-click and ⇧F10), and `Tabs` (the project tab and editor tab variants, preview tabs, the unsaved dot, the tab menu).
  - **Feedback:** `Toast` with Undo, `ConfirmDialog`, `Popover`, `Tooltip` (including the disabled-reason tooltip), and `EmptyState`.
  - **Data entry:** `KeyValueTable`, `CodeEditor` (keep Monaco), `SplitPane`, and `StatusChip`.
- [ ] **T17.C3** Shell:
  - the title-bar project tabs and the Running manager (auto-assigned ports, Stop all)
  - the header, the sidebar bands, the footer status bar, and the right context bar
  - per-project state: open tabs, sidebar, environment
  - Home with projects, devices, running now, getting started and recent
- [ ] **T17.C4** The native Tauri menu bar, with all menus, shortcuts and enabled/disabled states wired to the same command registry as the ⌘K search and the ⇧⌘P palette. The tray menu stays.
- [ ] **T17.C5** Keyboard map and a Shortcuts help sheet (⌘/). Accessibility pass: roles, focus order, and screen-reader labels.

### Phase D: move the existing features into the new shell (`ws17/d-pages`)
- [ ] **T17.D1** Endpoints in the Studio split:
  - **Mock pane:** scenarios as chips, the response editor, rules and JS handler, and per-endpoint delay and faults.
  - **Try pane:** a basic request builder for now; it gets its full features in phase E.
  - **Recent hits** strip at the bottom.
  - **Definition items:** OpenAPI, Shared response, GraphQL, WebSocket and SSE.
- [ ] **T17.D2** Data (a grid with inline edit), Users (with "Issue token"), Media, and Content (types and per-locale entries, RTL, draft/publish).
- [ ] **T17.D3** Traffic (live logs with detail, Replay and Open in runner), Inbox (webhooks), and the Push tester.
- [ ] **T17.D4** Simulate (global, per endpoint, network presets, OAuth2 mock), and Settings: server, HTTPS certificates, team server sign-in, accounts and roles, API keys, audit log, and CI sessions.
- [ ] **T17.D5** Remove the old tabs, and make sure every old feature has a new home. A checklist test maps each old tab and setting to its new place.

### Phase E: request runner (`ws17/e-runner`)
- [ ] **T17.E1** Request model and storage:
  - collections and folders as plain files in the project (`requests/*.json`, git-diffable)
  - history (local, capped), environments with `{{variables}}`, and secrets in the OS keychain (shown masked)
  - an auto-created "Local" environment per project: `baseUrl`, plus a token after login
- [ ] **T17.E2** Builder:
  - method and URL with variable highlighting and hover values
  - Params, Authorization (Bearer, Basic, API key, OAuth2 against the mock, "Act as app user"), Headers, Body (none, form-data, urlencoded, raw JSON/Text/XML, binary, GraphQL), and Settings (redirects, TLS, timeout, proxy)
  - Cookies (a cookie jar)
  - requests are sent by the engine or the Rust side, not the webview, so CORS does not apply
- [ ] **T17.E3** Response:
  - Pretty, Raw and Preview views, Headers, Cookies and Test Results
  - status, time and size with a timing breakdown
  - a JSONPath filter and search in the body
  - Save as example, and **Save as scenario**, which writes to the endpoint's mock
  - the response pane below or beside the request
- [ ] **T17.E4** cURL import (paste into the URL bar) and Copy as cURL. Code generation for cURL, fetch, axios, Python requests, Swift URLSession, Kotlin OkHttp and Dart http, in the right bar's Code panel.
- [ ] **T17.E5** Scripts and tests:
  - pre-request and post-response scripts in a sandbox (no Node or file access), with a small `my.*` API for variables, request, response and assertions
  - extract a value into a variable (for example to chain the login token)
- [ ] **T17.E6** Collection runner with a pass/fail report (JSON and JUnit), and `mockyard run <collection> --env <name>` for CI.
- [ ] **T17.E7** Realtime clients: GraphQL (schema fetch, variables), WebSocket and SSE.

### Phase F: devices and connecting an app (`ws17/f-devices`)
- [ ] **T17.F1** Device discovery:
  - iOS simulators (the existing `simctl`)
  - Android emulators and USB devices (`adb devices -l`, emulator name, API level)
  - physical devices seen on the LAN through recent traffic
  - browsers through the Mac trust store
  - each one with the correct base URL (`localhost`, `10.0.2.2`, or the LAN IP)
- [ ] **T17.F2** CA trust per device:
  - **Detect** the state: Trusted, Installed but not trusted, Not installed, or Unknown.
  - **Install CA:**
    - iOS simulator: `simctl keychain add-root-cert`.
    - Android emulator: push the CA and open the security settings. Note that only debug builds trust user CAs.
    - Physical device: QR download plus written steps.
  - **Honest next steps:** each flow states its remaining manual step.
  - **Status everywhere:** the overall state shows in the footer.
- [ ] **T17.F3** "Connect your app":
  - a framework picker (Web Vite/Next.js/fetch, React Native/Expo, Flutter, Swift, Kotlin, Node, curl) and a client-target picker, with a copyable snippet for the project's port
  - CORS settings in the engine (allowed origins, credentials, preflight) and the browser trust status
- [ ] **T17.F4** Device QR on the toolbar, in the Backend menu and on Home. New project templates: Blank, From OpenAPI, Mobile app preset (the old Tempo preset), and CRUD starter.

### Phase G: MCP server (`ws17/g-mcp`)
- [ ] **T17.G1** The engine hosts one MCP tool set over two transports:
  - **stdio:** `mockyard mcp`, which attaches to the running app with a per-install token, or runs headless on the project files.
  - **Streamable HTTP:** at `127.0.0.1:<port>/mcp`, with Origin and Host checks, bound to localhost; in team mode it sits behind team API keys.
  - **Before building:** check the transports and auth against the current MCP specification and the pinned SDK version (context7). Never from memory.
- [ ] **T17.G2** Tools, from `research.md` §2.2:
  - status and projects; endpoints, scenarios and handlers; OpenAPI import, sync and export
  - records and seed data; users and tokens; content; logs and `assert_request_received`
  - `send_request`, `run_collection` and `generate_code`
  - network and faults; push, webhooks, SSE and WebSocket emits; snapshots; docs
  - every tool annotated as read-only or destructive
- [ ] **T17.G3** Permissions:
  - profiles: read only, standard and full
  - scopes: read, write, destructive, handlers and external HTTP; `--disable-tools`
  - an automatic snapshot before each write batch
  - an SSRF guard on outbound URLs
  - logs and records returned as labelled untrusted data, with auth headers redacted
- [ ] **T17.G4** AI & MCP page and Agent activity:
  - on/off, transports, the token, and the profile
  - copy snippets for Claude Code, Codex and Cursor, plus "Copy AGENTS.md snippet"
  - a feed of tool calls with Undo, which restores the batch's snapshot
- [ ] **T17.G5** MCP contract tests: tool schemas, permission denials and snapshot and undo, plus a smoke test with a real MCP client.

### Phase H: power features (`ws17/h-power`)
- [ ] **T17.H1** Snapshots: named snapshots, restore, and "Reset to seed", built on the existing `snapshot.ts` archive format.
- [ ] **T17.H2** Proxy mode: unmatched routes are forwarded to a real API URL. **Record** turns proxied traffic into endpoints and scenarios, with secret headers stripped.
- [ ] **T17.H3** Request checks: "Expect requests" (method, path, body match, count, time window), available from the UI, the test kit, `mockyard` CLI and MCP.
- [ ] **T17.H4** OpenAPI request validation: incoming requests that break the spec are flagged in Traffic, with an optional strict 400. Generate TypeScript types from collections, content types and OpenAPI.
- [ ] **T17.H5** Import from Postman collection, Mockoon environment, Insomnia/Bruno, HAR and cURL. Export to OpenAPI, Postman and a backend archive. Each importer has fixture tests.
- [ ] **T17.H6** Stateful scenarios: a scenario can switch to the next one after N calls or on a request match (for example login fails twice, then succeeds).

### Phase I: share links (`ws17/i-share`)
Share a running backend with people outside the local network, like VS Code's port forwarding.
- [ ] **T17.I1** Research and ADR `018-share-links`:
  - **Providers to compare from their current docs:**
    - a relay through the owner's own Mockyard team server (no third party; it already has accounts and HTTPS)
    - Cloudflare Tunnel's no-account quick tunnels through `cloudflared`
    - ngrok with the user's own token
  - **For each provider, compare:** terms, limits, latency, cost, and how the binary is shipped or installed.
  - **Decide:** the default, and a pluggable `ShareProvider` interface (start, stop, status, public URL).
- [ ] **T17.I2** The engine's share mode:
  - Only the public API is exposed. The admin API (`/__admin`) and the MCP endpoint never are.
  - **Visibility:**
    - Private, the default: the link needs a share key, sent as a header or a `?key=` the first time, after which it is kept in a cookie.
    - Team: the link needs a team sign-in.
    - Public: an explicit choice, with a warning.
  - **Limits:**
    - an expiry (1 h, 8 h, 24 h, or until stopped)
    - an optional read-only mode (GET and HEAD only)
    - its own rate limit
  - **Requests through the link:** they are labelled "shared" in Traffic, and CORS allows the shared origin.
- [ ] **T17.I3** Share UI:
  - a Share button in the header and the Backend menu
  - a dialog with visibility, expiry and read-only options, the URL, a QR and Copy
  - active shares appear in the footer chip and the Running manager, with Revoke
  - shares stop automatically when the backend stops or the app quits
- [ ] **T17.I4** Tests: the admin API is never reachable through a share, a missing or wrong key is rejected, expiry and revoke take effect immediately, and read-only mode blocks writes. Docs page "Share a backend".

### Phase J: production readiness (`ws17/j-release`)
- [ ] **T17.J1** Auto-update with the Tauri updater: signed updates, a release channel, and an "Update available, restart to install" notice.
- [ ] **T17.J2** macOS signing and notarization, plus Windows and Linux builds if the engine sidecar supports them (ADR). A crash and error report that the user sends with one click (opt-in, no automatic telemetry).
- [ ] **T17.J3** Performance budgets (cold start, 10k log rows, 1 MB responses), an accessibility audit, and a full end-to-end flow with the WebDriver/Playwright setup the app already uses.
- [ ] **T17.J4** Docs: a Mockyard section in the docs site (getting started per framework, devices and CA, request runner, MCP, share links, CLI), plus release notes.

### Phase K: prepare the repository move (`ws17/k-extract`)
- [ ] **T17.K1** Make `apps/local-backend` self-contained: its own lint, tsconfig and prettier configs (copied or published), its own CI workflow, a README, a LICENSE, CONTRIBUTING, and a changelog.
- [ ] **T17.K2** Move dry run: `git subtree split` (or `filter-repo`) into a scratch repo, then build, test and package it there. Record the steps.
- [ ] **T17.K3** After the owner creates the new repo and runs the move, this monorepo consumes Mockyard from npm: the template's backend scripts and test kit come from `mockyard` and `@mockyard/testing`. Remove the in-repo copy.

## Phase A: design selection (`ws17/a-design`), done
- [x] **T17.A1** Round 1 (rejected): Workbench, Console, Inspector.
- [x] **T17.A2** Open-source feature survey and recommendations, in `research.md`.
- [x] **T17.A1b** Rounds 2 and 3: the Postman-familiar Familiar, Studio and Hub, in `designs/`, refined with selection actions, Devices, the framework-agnostic setup and the slate palette.
- [x] **T17.A3** The owner accepts any of the three. Claude chose Studio. The name is Mockyard. The share-links feature was added. The phases above are planned.
