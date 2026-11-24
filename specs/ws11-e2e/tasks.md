# WS11 tasks

Format: `- [ ] T<task id> <summary>`. Tick a box in the same commit that completes the task. Each plan task usually maps to several small commits; the plan lists the suggested commit headers.

- [ ] T11.1 Files: `e2e/config.yaml`, `e2e/flows/{auth-login,auth-logout,items-browse,profile-edit,settings-language-rtl,deeplink-settings}.yaml`, `e2e/subflows/{login,launch-clean}.yaml`, `e2e/README.md`.
- [ ] T11.2 Use `appId: ${APP_ID}` with a default `com.rntempo.app.dev`. Use only the §C14 testIDs. Tag flows with the AC IDs (`tags: [AC-1]`).
- [ ] T11.3 Script: `"e2e": "maestro test e2e/flows"`.
- [ ] T11.4 Done when: all flows pass locally on the Android emulator (devRelease, against the Tempo local backend: a local `serve` of `template/backend` or a CI session, since the in-app mocks were removed in T15.Z9); the iOS simulator run is documented.
- [ ] T11.5 Commits: one per 2 flows.
- [ ] T11.6 (from WS16 phase F, AC-T-*, AC-F-*, AC-L-*, AC-I-*, AC-C-*) Flows `settings-theme-palette`, `settings-text-size`, `settings-language-five`, `settings-app-icon` (Android) and `cms-whats-new` (cms module on), against the local backend. Commit: `test(e2e): cover settings customization and cms`.
- [ ] T11.7 (from WS16 phase F) Device tour on the iOS simulator and the Android emulator: 5 languages × light/dark × one brand palette × Extra large text, plus app icon switching and What's new. Screenshots go in the PR.
