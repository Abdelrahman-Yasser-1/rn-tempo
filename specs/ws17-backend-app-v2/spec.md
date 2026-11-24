# WS17: Tempo Local Backend app v2

Status: **Phase A (design selection) in progress.** The build phases are written after the owner picks a design and the features (amendment 61).

## Goal
Make the Tempo Local Backend desktop app (`apps/local-backend/app`) ready for production:
1. **A new UI and UX.** Organised navigation instead of ten flat tabs and a nine-part Settings page, a native menu bar, a command palette, keyboard shortcuts, light and dark themes, and good empty, loading and error states.
2. **AI agents can use it.** An MCP server lets Claude Code, Codex, Cursor and other agents read and change a backend: endpoints, data, logs, faults and requests. A permission level and an action log come with it.
3. **A request runner.** Send requests like Postman or curl: environments and variables, collections and history, cURL import and export, and code generation.
4. **Stronger features,** chosen from a survey of open-source API tools, each with a timing (now, next or later).

The engine, its API and its data formats stay compatible. Existing backends open without changes.

## Information architecture (shared by every design direction)
- **Workspace:** Backends (switcher, new, open), Requests (runner), Team (team server), Preferences.
- **Per backend:**
  - **Overview:** state, addresses, metrics.
  - **API:** Endpoints and scenarios, GraphQL, Realtime (SSE and WebSocket), Responses.
  - **Data:** Collections, Users, Media, Content (CMS).
  - **Traffic:** Logs, Webhooks inbox, Push tester.
  - **Simulate:** Faults and latency, Rate limits, Network presets, OAuth2 mock.
  - **Settings:** Server, Certificates, Tools, AI and MCP.

## Menu bar
Tempo, File, Edit, View, Backend, Request, Window and Help menus, with the standard macOS items and shortcuts. The full list is in the Phase A design brief and is shown in each design sample. In the app it becomes a Tauri menu. The web dashboard mode shows the same actions in the command palette.

## Phase A: design selection (`ws17/a-design`)
- [ ] **T17.A1** Three self-contained HTML design directions plus a comparison page, in `specs/ws17-backend-app-v2/designs/`:
  - **A Workbench:** IDE-like, with tree, tabs and a bottom panel.
  - **B Console:** a clean product dashboard with a grouped sidebar.
  - **C Inspector:** traffic first, with three panes.
- [x] **T17.A2** Open-source feature survey and recommendations (MCP tools, request runner must-haves, features by timing), in `specs/ws17-backend-app-v2/research.md`.
- [ ] **T17.A3** Owner picks a direction (or a mix) and the features. Record the decision here, then write phases B onward (design system, shell and menus, page migration, request runner, MCP server, chosen features, docs).
