<!-- T17.A2. Survey by a research agent on 2026-11-24 from official docs and READMEs (sources inline). Reviewed by Claude. -->

> **Checked against the Tempo code (2026-11-24).** This corrects the items marked **[confirm]** below:
> - **Has it:** log search (`Logs.tsx` search box), backend snapshots as export and import archives (`engine/src/snapshot.ts`), OpenAPI export (`engine/src/openapi.ts` `buildOpenApi`), a menu bar tray item (`src-tauri/src/tray.rs`), and QR codes for device addresses (Dashboard).
> - **Missing:** proxy or pass-through to a real backend, a command palette, multi-tab editing, an app menu (only the tray menu exists), an auto-updater, a one-click "reset to seed", and named in-app snapshots for undo.

# Tempo Local Backend: competitive feature research (2026-11-24)

Method: WebFetch/WebSearch of official docs/READMEs in this session. Every claim carries a source. Items I could not confirm are marked **[UNVERIFIED]**. "T" = Tempo has it today (from the owner's list): yes / partial / no.

## 0. Key sources (short names used below)

- Mockoon docs https://mockoon.com/docs/latest/about/ ; repo https://github.com/mockoon/mockoon ; CLI MCP release https://mockoon.com/releases/9.8.0/
- Hoppscotch repo https://github.com/hoppscotch/hoppscotch ; MCP tools https://docs.hoppscotch.io/documentation/clients/mcp-server/tools.md ; AI https://docs.hoppscotch.io/documentation/features/ai-features
- Bruno https://docs.usebruno.com/introduction/what-is-bruno ; repo https://github.com/usebruno/bruno
- Insomnia repo https://github.com/Kong/insomnia ; AI https://developer.konghq.com/insomnia/ai-in-insomnia.md
- Yaak README https://raw.githubusercontent.com/yaakapp/app/main/README.md
- HTTP Toolkit https://github.com/httptoolkit/httptoolkit ; docs https://httptoolkit.com/docs/
- WireMock OSS https://wiremock.org/docs/overview/ ; WireMock Cloud MCP https://docs.wiremock.io/ai-mcp/mcp-tools.md
- Prism https://docs.stoplight.io/docs/prism/674b27b261c3c-prism-overview
- Requestly https://docs.requestly.com/ ; mock server https://docs.requestly.com/api-client/mock-server.md
- Beeceptor MCP https://beeceptor.com/docs/mcp-agentic-mode/
- json-server https://github.com/typicode/json-server
- Postman MCP repo https://github.com/postmanlabs/postman-mcp-server ; tool list https://hub.docker.com/mcp/server/postman/tools
- Supabase MCP https://supabase.com/docs/guides/ai-tools/mcp.md
- MCP spec transports https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Microcks MCP (third-party listing only) https://a2a-mcp.org/entry/microcks-mcp.md
- PocketBase MCP (community) https://mcpservers.org/servers/mabeldata/pocketbase-mcp

Coverage gaps: PocketBase admin UI and Supabase Studio UI features were NOT retrieved from official docs (searches only returned MCP servers); Microcks official docs page 404'd; Prism page was a one-paragraph overview; Bruno/Insomnia/Hoppscotch pages are READMEs so gRPC/WebSocket/secret-manager details are partly unconfirmed. Where I list those apps, it is marked.

---

## 1. Feature tables

Timing: Now = in the redesign, Next = right after, Later = backlog, Skip.

### 1.1 Request runner

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| REST request builder (method, URL, params, headers, body types) | All clients: Hoppscotch, Bruno, Insomnia, Yaak, Requestly ([Hoppscotch](https://github.com/hoppscotch/hoppscotch), [Yaak](https://raw.githubusercontent.com/yaakapp/app/main/README.md), [Requestly](https://docs.requestly.com/)) | no | high | M | Now: the owner asked for it; the core of the redesign |
| Collections/folders | Hoppscotch, Bruno, Insomnia, Yaak, Requestly (same sources) | no | high | M | Now |
| Collections stored as plain files, git-friendly | Bruno (YAML, [docs](https://docs.usebruno.com/introduction/what-is-bruno)), Yaak (mirror to filesystem), Requestly ([docs](https://docs.requestly.com/)), Insomnia Git Sync ([repo](https://github.com/Kong/insomnia)) | no | high | M | Now: lets collections live in the RN repo and be reviewed in PRs |
| Environments and variables ({{base_url}}, dev/staging) | Bruno, Hoppscotch, Yaak, Requestly, Insomnia (same) | no | high | S | Now; auto-seed "Tempo local" env with base URL, token |
| Secrets in env (masked, keychain) | Yaak: encrypted secrets + OS keychain ([README](https://raw.githubusercontent.com/yaakapp/app/main/README.md)); Hoppscotch masks secrets in MCP ([tools](https://docs.hoppscotch.io/documentation/clients/mcp-server/tools.md)) | partial (app users/JWT only) | med | S | Next |
| History of sent requests | Hoppscotch, Insomnia, Bruno **[UNVERIFIED in fetched pages]** | partial (server-side request logs exist; client history no) | high | S | Now |
| cURL import | Hoppscotch ([repo](https://github.com/hoppscotch/hoppscotch)), Requestly ([docs](https://docs.requestly.com/)), Yaak ([README](https://raw.githubusercontent.com/yaakapp/app/main/README.md)) | no | high | S | Now |
| cURL / code generation (10+ langs) | Hoppscotch ([repo](https://github.com/hoppscotch/hoppscotch)); Hoppscotch MCP `generate_code` curl/JS/Python/Go/Rust | no | med-high | S | Now: cURL, fetch, axios minimum; "Copy as cURL" from log detail |
| "Send to runner" from request log (replay/edit) | HTTP Toolkit rewrite/replay concept ([docs](https://httptoolkit.com/docs/)); WireMock Cloud journal ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md)) | no | high | S | Now: Tempo already has the log, cheap win |
| Auth helpers (Basic, Bearer, OAuth2, JWT, API key) | Yaak (OAuth2, JWT, Basic, plugins), Hoppscotch, Insomnia, Bruno | partial (app user JWT, OAuth2 mock exist, no client-side helper) | high | M | Now: one-click "log in as app user X" token fill is Tempo-unique |
| Pre-request / post-response scripts | Bruno, Requestly, Insomnia, Hoppscotch ([Bruno](https://docs.usebruno.com/introduction/what-is-bruno), [Requestly](https://docs.requestly.com/)) | no | med | M | Next |
| Tests/assertions on response | Bruno, Requestly, Insomnia ("native test suites"), Hoppscotch `validate_response` | no | med | M | Next |
| Collection runner (sequence) | Requestly ([docs](https://docs.requestly.com/)), Insomnia ([repo](https://github.com/Kong/insomnia)), Postman | no | med | M | Next |
| GraphQL client with schema docs | Hoppscotch, Insomnia, Yaak, Bruno (implied) | partial (GraphQL server only) | med | M | Next |
| WebSocket client | Hoppscotch, Insomnia, Yaak | partial (WS server only) | med | M | Next |
| SSE client | Hoppscotch, Insomnia, Yaak | partial (SSE server only) | med | S | Next |
| gRPC client | Insomnia, Yaak; Bruno **[UNVERIFIED]** | no | low (RN rarely gRPC) | L | Skip |
| MQTT / Socket.IO | Hoppscotch ([repo](https://github.com/hoppscotch/hoppscotch)) | no | low | M | Skip |
| Cookie jar | Postman/Insomnia/Yaak **[UNVERIFIED in fetched sources]** | no | low-med (RN is mostly token auth) | S | Later |
| Response filter (JSONPath/XPath) | Yaak ([README](https://raw.githubusercontent.com/yaakapp/app/main/README.md)) | no | med | S | Next |
| Template tags in requests (uuid, timestamp, faker) | Yaak, Mockoon | partial (dynamic values in base response) | med | S | Now: reuse the existing generator |
| Multi-tab requests | all GUI clients | no | med | S | Now (see 1.9) |

### 1.2 Mocking and simulation

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Multiple responses per route + rules | Mockoon ([docs](https://mockoon.com/docs/latest/about/)), Beeceptor, Requestly ([mock](https://docs.requestly.com/api-client/mock-server.md)) | yes (scenarios) | high | - | have |
| Templating (Handlebars/Faker) | Mockoon, WireMock ([overview](https://wiremock.org/docs/overview/)), Beeceptor | yes (dynamic values) | high | - | have |
| Stateful mocks | WireMock scenarios, Beeceptor state/key-value ([MCP doc](https://beeceptor.com/docs/mcp-agentic-mode/)), Mockoon data buckets | partial (SQLite collections; no state-machine scenario transitions) | high | M | Next |
| Fault injection, delay | WireMock, HTTP Toolkit ([repo](https://github.com/httptoolkit/httptoolkit)), Beeceptor chaos | yes | high | - | have |
| Rate limits, chaos settings | WireMock Cloud settings ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md)), Beeceptor | yes | med | - | have |
| Proxy to real backend, partial mocking | Mockoon, WireMock, Beeceptor, HTTP Toolkit | partial **[confirm]** | high | M | Now/Next: "mock only these routes, forward the rest" is the top RN workflow |
| Record and playback (traffic to stubs) | WireMock OSS + Cloud (start/stop_recording), Mockoon (auto-mock/record) | no | high | M | Next |
| OpenAPI import (and sync) | Mockoon, Prism, Beeceptor, Microcks | yes | high | - | have |
| Request validation against OpenAPI (contract check) | Prism: "request validation", validating proxy ([overview](https://docs.stoplight.io/docs/prism/674b27b261c3c-prism-overview)) | no | med-high | M | Next: catches RN app sending bad payloads |
| Callbacks | Prism, Mockoon ([docs](https://mockoon.com/docs/latest/about/)) | yes (webhooks) | med | - | have |
| CRUD routes auto-generated | Mockoon, json-server ([repo](https://github.com/typicode/json-server)) | yes (collections) | high | - | have |
| json-server query ops (filter operators, `_page/_per_page`, `_embed`, `_where`, `_dependent`) | json-server | partial **[verify op parity]** | med | S-M | Next |
| Serve files/static | Mockoon, json-server | yes (media) | low | - | have |
| WebSocket mock | Mockoon, WireMock OSS ([overview](https://wiremock.org/docs/overview/)) | yes | med | - | have |
| gRPC / GraphQL mock | WireMock (adapters "soon"), Mockoon (not confirmed) | GraphQL yes | low | - | Skip gRPC |
| Request verification (assert "app called X with body Y") | WireMock | partial (logs) | med-high | S | Next: also exposed as MCP tool |
| Mock deployments to cloud | Mockoon Pro, WireMock Cloud | team server | low | - | Skip |

### 1.3 Data and CMS

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Data buckets / collections | Mockoon, json-server, PocketBase (collections) | yes | high | - | have |
| Admin UI for records (grid, filter, inline edit) | PocketBase, Supabase Studio **[UNVERIFIED: official docs not fetched]** | yes (assumed) | high | - | check polish |
| Schema-driven API rules (per-collection access rules) | PocketBase API rules **[UNVERIFIED]** | partial | med | M | Later |
| Seed data / reset-to-seed / snapshots | Beeceptor reset state, WireMock `reset_state` ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md)) | partial **[confirm]** | high | S | Now: "Reset to seed" and named snapshots help repeatable RN demos/tests |
| CSV/DB data sources | WireMock Cloud data sources ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md)) | no | low-med | M | Later |
| Typescript types generated from schema | Supabase `generate_typescript_types` ([doc](https://supabase.com/docs/guides/ai-tools/mcp.md)) | no | high for RN | S-M | Next: generate types from collections/content types/OpenAPI |
| Logs query | Supabase `query_logs`, PocketBase `list_logs` ([mcpservers](https://mcpservers.org/servers/mabeldata/pocketbase-mcp)) | yes | high | - | have (expose via MCP) |
| Backups/export of whole workspace | PocketBase listing mentions backups **[community MCP]** | partial | med | S | Next |

### 1.4 Traffic and debugging

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Live request log + detail | Mockoon, WireMock journal, Beeceptor history | yes | high | - | have |
| Search/filter log | WireMock `search_request_journal`, Beeceptor | partial **[confirm]** | high | S | Now |
| Intercepting HTTPS proxy of arbitrary device traffic | HTTP Toolkit (browsers, Android, Electron, Docker etc.; [repo](https://github.com/httptoolkit/httptoolkit)) | no | med | L | Skip: different product (HTTP Toolkit/Proxyman/Charles); Tempo is the server |
| Breakpoints (pause/edit req/res) | HTTP Toolkit | no | low | L | Skip |
| Replay a logged request | Requestly/HTTP Toolkit rewrite | no | high | S | Now |
| Diff two responses/requests | HTTP Toolkit lists "request diffing" as planned | no | low | M | Later |
| HAR import/export | **[UNVERIFIED in fetched pages]** | no | med | S | Later |
| Device pairing helper (QR code with LAN IP, Android emulator 10.0.2.2, iOS sim) | none found | partial? **[confirm]** | high for RN | S | Now: RN-specific differentiator |
| Mockoon-style admin API (state, logs, events) | Mockoon ([docs](https://mockoon.com/docs/latest/about/)) | yes (dashboard/team API) | med | - | have |

### 1.5 Collaboration and team

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Git-based sharing (files in repo) | Bruno, Yaak, Requestly, Insomnia Git Sync | no | high | M | Now (same work as file collections; also project config as files) |
| Cloud workspace sharing | Mockoon Cloud/Pro, Postman, Hoppscotch teams, WireMock Cloud | yes (team server) | med | - | have |
| Roles / team management | Hoppscotch teams (MCP tools [list](https://docs.hoppscotch.io/documentation/clients/mcp-server/tools.md)) | yes | med | - | have |
| Audit log | Enterprise tools | yes | low | - | have |
| Shared env var sets | Hoppscotch team envs | partial | med | S | Next |

### 1.6 Testing and CI

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Headless CLI (run mocks, run collections) | Mockoon CLI ([repo](https://github.com/mockoon/mockoon)), Bruno CLI, Hoppscotch CLI, Insomnia Inso | partial (Jest kit, team server) | high | M | Now/Next: `tempo start --project`, `tempo run collection` |
| Docker image | Mockoon, Bruno | yes (team server) | med | - | have |
| Jest/test helper that runs engine in-memory | WireMock (JUnit), no equivalent for RN found | yes | high | - | have: marketing point |
| Temporary isolated sessions for CI | none found | yes | high | - | have |
| Assertions in runner / JUnit/JSON report | Bruno CLI reports | no | med | S | Next |
| Contract tests from OpenAPI | Microcks, Prism | no | med | M | Later |
| Maestro/Detox helper (reset state, set scenario via CLI) | none found | partial | high | S | Next |

### 1.7 AI and MCP

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| MCP server over local mocks | Mockoon CLI `mockoon-cli mcp` (list/start/stop/list running only; [release](https://mockoon.com/releases/9.8.0/)); WireMock CLI/cloud, 29 tools ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md)); Beeceptor remote OAuth ([doc](https://beeceptor.com/docs/mcp-agentic-mode/)); Hoppscotch 53 tools ([tools](https://docs.hoppscotch.io/documentation/clients/mcp-server/tools.md)); Postman 42-106+ tools ([repo](https://github.com/postmanlabs/postman-mcp-server)); Supabase ([doc](https://supabase.com/docs/guides/ai-tools/mcp.md)); Requestly rules CRUD over stdio ([listing](https://glama.ai/mcp/servers/@requestly/mcp)); Microcks (mocks as MCP endpoints, [third-party](https://a2a-mcp.org/entry/microcks-mcp.md)) | no | high | M | Now: owner request |
| MCP server NOT shipped officially | Bruno (community only: [macarthy](https://github.com/macarthy/bruno-mcp), others), HTTP Toolkit (community: [glama](https://glama.ai/mcp/servers/fdciabdul/httptoolkit-mcp)), Yaak (experimental MCP plugin reportedly deprecated in favor of CLI; secondary source [apidog](https://apidog.com/blog/what-is-yaak-api-client/)), json-server, Prism **[UNVERIFIED]** | - | - | - | context: a gap Tempo can fill |
| MCP client inside the app | Insomnia (HTTP + STDIO, tools/prompts/resources; [doc](https://developer.konghq.com/insomnia/ai-in-insomnia.md)) | no | low | M | Skip |
| AI generates mocks from prompt / OpenAPI / live URL | Insomnia, Beeceptor "AI rules generator", Hoppscotch AI (experimental; payloads, test cases, scripts; not self-hosted; [doc](https://docs.hoppscotch.io/documentation/features/ai-features)) | no | med | M | Later: MCP gives the same via the user's own agent, with no key handling |
| AI commit suggestions | Insomnia | n/a | low | - | Skip |
| llms.txt / machine-readable docs, `AGENTS.md` snippet generator | MockServer, WireMock publish llms/docs ([MockServer](https://mock-server.com/llms.txt)) | no | med | S | Next: "Copy MCP config / AGENTS.md snippet" button |
| `look_up_documentation` tool | WireMock | no | low | S | Later |
| OpenAPI-to-agent skill / plugin | WireMock agent skills plugin ([docs](https://docs.wiremock.io/ai-mcp/mcp-installation)) | no | med | S | Later |

### 1.8 Import / export and interoperability

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| OpenAPI/Swagger import | all | yes | high | - | have |
| OpenAPI export from mocks | Mockoon | partial **[confirm]** | med | S | Next |
| Postman collection import | Bruno, Requestly, Yaak, Hoppscotch | no | high | M | Now with runner (adoption path) |
| Insomnia import | Yaak | no | low | S | Later |
| Bruno import/export | Yaak? **[UNVERIFIED]** | no | low | M | Later |
| Hoppscotch JSON import/export | Hoppscotch | no | low | S | Later |
| Mockoon environment import | Mockoon CLI import/export | no | med | M | Next: easy migration for Mockoon users |
| WireMock stub mappings import/export | WireMock | no | low-med | S | Later |
| HAR import | **[UNVERIFIED]** | no | med | S | Later |
| Export collections as cURL/ Postman | Hoppscotch | no | med | S | Next |

### 1.9 Desktop UX

| Feature | Which apps | T | Value | Effort | Timing |
|---|---|---|---|---|---|
| Native menus, app menu bar | Mockoon, Insomnia, Bruno | **[confirm]** | med | S | Now |
| Command palette (Cmd+K: jump to endpoint, run action, switch project) | Hoppscotch (not mentioned in README; **[UNVERIFIED]**), Insomnia, Yaak **[UNVERIFIED]** | no? | high | S-M | Now: biggest UX win for power users and keeps the redesign consistent |
| Keyboard shortcuts | Hoppscotch ([repo](https://github.com/hoppscotch/hoppscotch)) | partial | med | S | Now |
| Tabs (multiple requests/endpoints open) | Hoppscotch, Insomnia, Bruno, Yaak | **[confirm]** | high | M | Now |
| Themes: System/Light/Dark/Black + accent + Zen mode | Hoppscotch ([repo](https://github.com/hoppscotch/hoppscotch)); Yaak custom themes | partial | low-med | S | Next |
| Tray/menu bar icon with server status and quick toggles | Mockoon? **[UNVERIFIED]** | **[confirm]** | med | S | Next |
| Auto-update, crash reporting | all | **[confirm]** | high | S | Now (production-ready) |
| Offline/no account | Bruno, Insomnia Scratch Pad | yes | high | - | have |

---

## 2. Proposed MCP server for Tempo

### 2.1 What existing servers expose (evidence)

- Postman: 42 tools in Docker catalog, groups collections (create/get/run/sync), specs, mocks, environments, workspaces, search; modes minimal/code/full (100+); remote streamable HTTP with OAuth or API key Bearer, local stdio with API key ([repo](https://github.com/postmanlabs/postman-mcp-server), [tools](https://hub.docker.com/mcp/server/postman/tools)).
- WireMock Cloud: 29 tools: mock API CRUD, stubs CRUD, push/pull specs, request journal search/reset, recording start/stop/status, data sources, `make_http_request`, settings (chaos/rate limit), `reset_state`, `look_up_documentation`; destructive ones can be disabled with `--disabled-tools` per secondary search result ([tools](https://docs.wiremock.io/ai-mcp/mcp-tools.md), [search summary](https://docs.wiremock.io/ai-mcp/mcp-installation)).
- Hoppscotch: 53 tools in 10 groups incl. `execute_request`, `validate_response`, `generate_code`, `generate_documentation`; masks secret env values; browser sign-in token cached or `HOPPSCOTCH_ACCESS_TOKEN` ([tools](https://docs.hoppscotch.io/documentation/clients/mcp-server/tools.md)).
- Beeceptor: endpoint info, rule CRUD/reorder, chaos/latency/CRUD scenarios, request-history search/purge, key-value state, settings, template helper and OpenAPI reference; remote Streamable HTTP with OAuth ([doc](https://beeceptor.com/docs/mcp-agentic-mode/)).
- Mockoon CLI: only list/start/stop/list-running ([release](https://mockoon.com/releases/9.8.0/)). Weakest; Tempo can clearly exceed it.
- Supabase: tool groups switched by URL (`features`), `read_only=true`, `project_ref` scope, "dev only" warning, prompt-injection warning ([doc](https://supabase.com/docs/guides/ai-tools/mcp.md)).

### 2.2 Proposed Tempo tool list

Naming: `tempo_*`; all inputs validated with zod; every response is JSON text with a short summary field. Annotate with MCP `readOnlyHint` / `destructiveHint`. R = read-only, W = write, D = destructive.

| Tool | What it does | R/W | Risk notes |
|---|---|---|---|
| `tempo_status` | Engine version, running ports, active project, base URL, HTTPS state, active network preset | R | none |
| `tempo_list_projects` / `tempo_switch_project` | List/select local mock project | R / W | switch changes what app hits |
| `tempo_list_endpoints` | Endpoints with method, path, scenarios, active scenario, handler flag | R | none |
| `tempo_get_endpoint` | Full endpoint JSON incl. scenarios | R | handler source may contain secrets |
| `tempo_create_endpoint` / `tempo_update_endpoint` | Create/patch endpoint JSON (validated against schema) | W | returns diff; dry-run flag |
| `tempo_delete_endpoint` | Remove endpoint | D | require `confirm:true`; auto-snapshot first |
| `tempo_set_active_scenario` | Switch scenario for an endpoint (e.g. 401, empty, error) | W | the main "make app show error state" lever |
| `tempo_set_handler` | Set/replace JS handler | W | **code execution** in sidecar; gate behind explicit permission scope `handlers` |
| `tempo_import_openapi` / `tempo_sync_openapi` | Import/sync from URL or file | W | URL fetch SSRF: allow only http(s), warn on private ranges unless user opted in |
| `tempo_export_openapi` | Generate spec from current endpoints | R | none |
| `tempo_list_collections` / `tempo_query_records` | Data collections and records (filter/sort/page) | R | may expose PII in seed data; cap rows |
| `tempo_upsert_record` / `tempo_delete_record` / `tempo_seed_collection` | Write data | W / D | snapshot before bulk |
| `tempo_reset_data` | Reset to seed / snapshot | D | confirm |
| `tempo_list_users` / `tempo_create_app_user` / `tempo_issue_token` | App users and JWT for test login | W | tokens are local-mock only; label as such |
| `tempo_list_content_types` / `tempo_get_entries` / `tempo_upsert_entry` / `tempo_publish_entry` | CMS read/write, locale-aware | R/W | publish is visible to app |
| `tempo_get_logs` | Search request logs (method, path, status, time range, body text, limit) | R | bodies may hold tokens: redact `Authorization` by default |
| `tempo_get_log_entry` | Full request/response detail | R | same redaction |
| `tempo_clear_logs` | Purge logs | D | confirm |
| `tempo_assert_request_received` | WireMock-style verify: count matching requests in window | R | high value for agent-driven RN QA |
| `tempo_send_request` | Request runner: method/url/headers/body/env, optional `as_user` | W (side effects) | SSRF: default allow-list = Tempo's own base URL and project hosts; external hosts need `allowExternal` |
| `tempo_run_collection` | Run saved collection with assertions, returns pass/fail summary | W | rate-capped |
| `tempo_generate_code` | cURL/fetch/axios for a request | R | none |
| `tempo_set_network_preset` | Global latency/offline/3G preset | W | affects all traffic |
| `tempo_set_fault` | Per-endpoint fault/latency/rate-limit | W | `clear` counterpart `tempo_clear_faults` |
| `tempo_send_push` | Push notification test sender | W | only to configured test devices |
| `tempo_trigger_webhook` / `tempo_list_webhook_inbox` | Fire/inspect webhooks | W / R | outbound HTTP: same SSRF guard |
| `tempo_emit_sse` / `tempo_emit_ws` | Push event/message to connected clients | W | none |
| `tempo_snapshot_create` / `tempo_snapshot_restore` | Save/restore whole project state | W / D | makes all other writes recoverable |
| `tempo_get_docs` | Return schema docs + template helper reference (like Beeceptor/WireMock) | R | helps agent write valid JSON |
| `tempo_list_sessions` / `tempo_create_session` | Isolated temp session for CI (team mode) | W | team mode only |

Also expose MCP **resources** (`tempo://endpoints`, `tempo://logs/recent`, `tempo://schema/endpoint`) and **prompts** ("mock this screen's API from my TS types", "reproduce this bug with scenario X"). Resources/prompts for these specific APIs are my recommendation; not copied from a competitor **[design proposal]**.

Profiles (modelled on Postman minimal/full and Supabase `features`): `--tools readonly | standard | full`, plus `--disable-tools a,b` (WireMock-style). Default for Codex/Cursor = `standard` (no handlers, no destructive deletes without confirm).

### 2.3 Transport and auth recommendation

- Ship **both**, one tool implementation:
  1. **stdio** (`tempo mcp` / `npx @tempo/mcp`) as the default for local desktop use. Spec says clients SHOULD support stdio whenever possible and it has no network exposure ([spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)). It is how Mockoon (`mockoon-cli mcp`) and Hoppscotch work. The stdio process connects to the running engine over loopback with a per-install token (so it controls the same live state the UI shows), or starts headless against project files if no app is running.
  2. **Streamable HTTP** at `http://127.0.0.1:<port>/mcp` hosted by the engine for always-on use and for team server mode (`https://team.example/mcp`). Spec MUSTs: validate `Origin`, bind localhost only when local, authenticate ([spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)). Do not build the old HTTP+SSE transport (deprecated by the spec).
- Auth model:
  - Local: bearer token generated per install, stored in app config (0600), shown in a "Connect AI agent" panel with copy-paste snippets for `claude mcp add --transport http ...`, `codex mcp add ...`, Cursor JSON (patterns from [Beeceptor](https://beeceptor.com/docs/mcp-agentic-mode/)). Reject requests with foreign Origin/Host (DNS rebinding).
  - Team server: reuse existing API keys and roles; token carries role + project scope; OAuth is optional later (Beeceptor/Supabase use OAuth, Supabase offers PAT for CI; [Supabase](https://supabase.com/docs/guides/ai-tools/mcp.md)). **[UNVERIFIED]** I did not fetch the MCP authorization spec; OAuth 2.1 requirement for remote servers is from memory.
  - Permission scopes per token/profile: `read`, `write`, `destructive`, `handlers`, `external-http`. Audit-log every tool call (team mode already has audit log). Show an "agent activity" feed in the UI.
  - Prompt-injection hygiene: request logs and records are untrusted data; Supabase explicitly warns about injected instructions in data ([doc](https://supabase.com/docs/guides/ai-tools/mcp.md)). Wrap log bodies in clearly labelled data fields, cap sizes, redact auth headers.
  - Auto-snapshot before any write batch so an agent mistake is one click to undo.

---

## 3. Request runner must-haves (minimum credible vs Postman/Bruno/Hoppscotch)

1. Request builder: method, URL, query params table, headers table, body (JSON, form-data, urlencoded, raw, binary), tabs, response viewer (pretty/raw/preview, headers, status, time, size, copy).
2. Environments and variables with `{{var}}` interpolation, an auto-created "Tempo local" environment, secret masking. ([Bruno](https://docs.usebruno.com/introduction/what-is-bruno), [Requestly](https://docs.requestly.com/))
3. Collections and folders saved as plain files inside the project (git-diffable). ([Bruno](https://docs.usebruno.com/introduction/what-is-bruno), [Yaak](https://raw.githubusercontent.com/yaakapp/app/main/README.md))
4. History (every sent request, re-run, save to collection) and "open from request log".
5. cURL import (paste into URL bar) and cURL/fetch/axios copy; Postman collection import. ([Hoppscotch](https://github.com/hoppscotch/hoppscotch), [Requestly](https://docs.requestly.com/))
6. Auth helpers: Bearer, Basic, API key, OAuth2 (code/client creds against the mock OAuth2), plus Tempo-specific "act as app user".
7. Pre-request and post-response scripts and basic assertions/tests; extract-variable-from-response (chain login token). ([Bruno](https://docs.usebruno.com/introduction/what-is-bruno), [Requestly](https://docs.requestly.com/))
8. Collection runner with pass/fail report; CLI parity for CI.
9. GraphQL (schema fetch, variables), WebSocket and SSE clients; these are the realtime protocols Tempo already serves. gRPC/MQTT/Socket.IO are skippable. ([Hoppscotch](https://github.com/hoppscotch/hoppscotch), [Yaak](https://raw.githubusercontent.com/yaakapp/app/main/README.md))
10. Cookie jar (basic), redirects toggle, TLS/self-signed toggle (mkcert already present), timeouts, proxy setting.
11. Response filter (JSONPath) and save-response-as-mock-scenario (Tempo unique: turn any response into a scenario).

Cut line for "Now": 1-6, 11, simple 8. "Next": 7 full scripting, 9, 10.

---

## 4. Top 10 recommendations (ranked)

1. **MCP server (stdio + local Streamable HTTP, profiles, scopes, auto-snapshot)** with the tool list in 2.2. Strongest gap: Mockoon's official MCP only lists/starts/stops mocks; Bruno/HTTP Toolkit have only community ones. **Now.**
2. **Request runner core** (builder, tabs, environments, collections as files, history, cURL import/export, code gen, auth helpers). **Now.**
3. **Replay/edit from request log + "save response as scenario"** (cheap, uses existing logs; unique loop of capture -> mock). **Now.**
4. **Proxy/partial mocking with record-to-stubs** (WireMock/Mockoon/Beeceptor pattern: mock some routes, forward the rest, record the rest into endpoints). **Next** (start with pass-through if not present, then recording).
5. **Project-as-files + git sharing + CLI (`tempo start`, `tempo run`)**, Postman and Mockoon environment import for adoption. **Now** for files, **Next** for CLI/import. (Bruno, Yaak, Mockoon CLI.)
6. **Command palette, tabs, shortcuts, native menu, updater, crash reporting** for a production-ready desktop feel. **Now.**
7. **Request verification + assertions** (`assert_request_received`, runner tests, JUnit/JSON output) usable from Jest kit, Maestro/Detox, MCP. (WireMock verification, Bruno CLI.) **Next.**
8. **Stateful scenarios and snapshots/reset-to-seed** (WireMock scenarios, Beeceptor state). **Next** (snapshots **Now** since MCP safety depends on them).
9. **OpenAPI contract validation of incoming requests** (Prism validation proxy) and **TypeScript type generation** from collections/OpenAPI/CMS (Supabase `generate_typescript_types`). **Next.**
10. **RN-specific polish**: QR/LAN device pairing, emulator host hints (10.0.2.2), "Copy MCP config / AGENTS.md snippet", GraphQL/WS/SSE clients. **Now** for pairing/snippet, **Next** for realtime clients. Skip: gRPC, MQTT, intercepting proxy, breakpoints, in-app MCP client, AI generation inside the app.

---

## 5. Unverified / caveats

- Did not retrieve official PocketBase admin UI or Supabase Studio feature docs, Microcks official docs (404), Bruno gRPC/WebSocket/secrets, Insomnia import formats, HTTP Toolkit iOS/HAR, Yaak MCP/CLI status (only a secondary article says its MCP plugin was deprecated), Requestly mock/MCP details beyond search snippets, Prism specifics beyond a one-line overview, MCP authorization spec.
- Tool counts differ by source (Postman 37/42/106/113 depending on listing; Hoppscotch 53 from its own docs).
- "Tempo has it?" is based only on the owner's list; items marked **[confirm]** need a check against the codebase (proxy/pass-through, search/filter in logs, tabs, command palette, snapshots, tray, updater, OpenAPI export).
- Beeceptor MCP free-vs-paid plan conflicts across sources.
- Mockoon CLI MCP transport not stated on the release page (command-launched, likely stdio).
