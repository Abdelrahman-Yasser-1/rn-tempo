# Tempo local backend

This folder is the app's backend as a [Tempo Local Backend](https://github.com/Abdelrahman-Yasser-1/rn-tempo) folder: a real HTTP API (sign-in, refresh, profile, users, 100 products, OTP, app config, media upload, a stats handler and a "What's new" content type) that you edit in an app instead of in code. It answers the same C13 contract as `api/` and it is checked against it (`yarn backend:check`, part of `yarn verify`).

Sign in as `emilys` / `emilyspass`.

## Open it

- **Mac app:** open the Tempo Local Backend app and choose this folder (`backend/`).
- **Any OS, in the browser:** `npx @rn-tempo/local-backend` prints a one-time login code and opens the dashboard on `127.0.0.1`. Add this folder as a backend there.
- **Just serve it:** `yarn backend --http --port 8555` serves it on that port (it uses HTTPS on 8443 when `.data/certs` exists).

## What to commit

| Path           | Commit? | What it is                                                           |
| -------------- | ------- | -------------------------------------------------------------------- |
| `backend.json` | yes     | The definition: collections, endpoints, scenarios, users, content.   |
| `seed/`        | yes     | Seed rows (`products.json`).                                         |
| `handlers/`    | yes     | JavaScript handlers for endpoints of type `handler`.                 |
| `.data/`       | **no**  | The database, certificates, logs and uploads. It is git-ignored.     |

## Tests

`yarn test:backend` runs the whole Jest suite against this folder, in memory and in test mode (no delays, no random faults, a fixed clock). Each test file gets its own copy, so tests never share data. `yarn test` (the default) still uses the old MSW handlers from `api/`, which are deprecated.

Point the tests at another backend with `TEMPO_BACKEND=<folder or https://host/b/name>` and, for a team server, `TEMPO_BACKEND_KEY=<read-definition key>`.
