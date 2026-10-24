# WS11 tasks

Format: `- [ ] T<task id> <summary>`. Tick a box in the same commit that completes the task. Each plan task usually maps to several small commits; the plan lists the suggested commit headers.

- [ ] T11.1 Files: `e2e/config.yaml`, `e2e/flows/{auth-login,auth-logout,items-browse,profile-edit,settings-language-rtl,deeplink-settings}.yaml`, `e2e/subflows/{login,launch-clean}.yaml`, `e2e/README.md`.
- [ ] T11.2 Use `appId: ${APP_ID}` with a default `com.rntempo.app.dev`. Use only the §C14 testIDs. Tag flows with the AC IDs (`tags: [AC-1]`).
- [ ] T11.3 Script: `"e2e": "maestro test e2e/flows"`.
- [ ] T11.4 Done when: all flows pass locally on the Android emulator (devRelease, mocks on); the iOS simulator run is documented.
- [ ] T11.5 Commits: one per 2 flows.
