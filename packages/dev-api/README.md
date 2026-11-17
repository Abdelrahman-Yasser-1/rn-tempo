# @rn-tempo/dev-api

A local mock API for RN-TEMPO apps. It serves seeded data generated from your Zod response schemas, fixed data and scenarios when you set them, and it is started with the `tempo-api` command.

**It is a development tool.** Its mock auth issues opaque tokens that anyone can obtain with a public test login. Never expose it to a network you do not control and never use it in production.

Usage is documented in the docs site under Backend, Dev API.

## Data generator

`generate(schema, { seed, key })` returns a value that `schema` parses. The same seed and key always give the same value (a fixed reference date keeps `createdAt`-style fields stable across days).

### How schemas are read

The walker reads `schema._zod.def` (see [zod.dev/packages/core](https://zod.dev/packages/core)): `def.type` names the kind, and `def.checks[i]._zod.def.check` describes each constraint (`min_length`, `greater_than`, `string_format`, `multiple_of`, ...).

We chose this over `z.toJSONSchema()` because JSON Schema cannot represent several things a response schema often uses: `z.date()`, `transform` and `lazy` throw by default, custom `refine` checks are dropped, and input and output types are merged. `def` has all of them. The cost is that the walker follows Zod's internal shape, so the Zod version is pinned (4.6.7) and the tests cover each kind.

### Fixed data beats generation

1. the endpoint's own `data`
2. `fixtures/<endpointId>.json` next to the config (a `:` in the id may be written as `_`)
3. generated data

### Realistic values

Field names such as `email`, `phone`, `firstName`, `price`, `rating`, `stock` and `createdAt` get realistic values from `@faker-js/faker`. A hint is used only when the schema accepts it. `.meta({ example })` (or `examples`) overrides a field, and so does `.describe('... example: foo')`.

Recursive schemas (`lazy` or getters) stop at a depth cap: optional fields are left out, nullable ones become `null` and arrays become empty.

## Command line

```sh
tempo-api up [--port 8443] [--host 0.0.0.0]   # background server, prints URLs and a QR code
tempo-api status | down | logs [-f] | reset
tempo-api scenario set <endpointId> <name>
tempo-api scenario clear [endpointId]
tempo-api start                                # foreground, for Docker and debugging
tempo-api certs [--out dir] [--host name]...   # local HTTPS certificate (needs mkcert)
tempo-api trust ios | android                  # trust the local CA on a simulator or emulator
tempo-api dev ios | android [--port] [--http]  # certs if missing, trust, then up
```

`up` and `start` serve HTTPS when `.tempo-api/certs/cert.pem` and `key.pem` exist, and plain HTTP otherwise (with a one-line hint). `--http` forces HTTP.

All commands take `--config <file>` (default `api/tempo-api.config.ts`) and `--cwd <dir>`. State lives in `.tempo-api/`: `server.pid`, `server.log`, `db.json` and `control-token` (owner-only; the CLI sends it to the internal control routes). `down` only stops the process named in its own pid file, and only after the recorded port answers `/__tempo/health` with that same pid.

The config is TypeScript, loaded with [jiti](https://github.com/unjs/jiti) with `tsconfigPaths`, so it can import app code through aliases such as `@features/*`.

## Local HTTPS

`tempo-api certs` wraps [mkcert](https://github.com/FiloSottile/mkcert) (`brew install mkcert`; nothing is downloaded for you).

- It creates the local CA in mkcert's `CAROOT` the first time (`mkcert -CAROOT` prints where), and writes `cert.pem`, `key.pem` and a copy of the public `rootCA.pem` to `--out` (default `.tempo-api/certs`).
- The certificate covers `localhost`, `127.0.0.1`, `::1`, `10.0.2.2` (the Android emulator's host), `dev-api.tempo.test`, `api.tempo.test`, `portal.tempo.test`, your current LAN IP and every `--host` (repeat the flag or use a comma list).
- It does **not** change any trust store. `--install` runs `mkcert -install`, which adds the CA to this computer's trust stores so a browser trusts Swagger; it asks for the system password and is off by default.
- When your LAN IP changes, `up` says the certificate does not cover it. Run `certs` again.
- The CLI's own calls (`status`, `down`, `scenario`, `reset`) go to `127.0.0.1` and trust only the generated `rootCA.pem`. Certificate checks are never switched off. The pid record keeps the scheme.
- `yarn backend:certs` in the monorepo writes the same certificate to `docker/certs` (gitignored) for Caddy, so a phone trusts one CA for everything.

`tempo-api trust ios [--device <udid>]` adds the CA to a simulator with `xcrun simctl keychain`; `tempo-api trust android [--push] [--serial <id>]` prints the Android steps and can run the `adb push`. The CA's private key never leaves your machine. See the docs page Backend, Local HTTPS.

`up` listens on `0.0.0.0` by default so a phone on the same Wi-Fi can use the QR code. Pass `--host 127.0.0.1` to keep it on this machine.

## Runtime entry and generators

`@rn-tempo/dev-api/runtime` exports `createRuntime(config)`: the request pipeline (auth, validate, scenario, data, response check) with an in-memory store, and no `express`, `pino`, `node:*` or faker import. The Express server calls it, and so do the MSW handlers (`toMswHandlers`) and the template's in-app mock adapter. A test checks the import list of `src/runtime`.

`tempo-api openapi | collections | msw | generate | check` write and verify `generated/` next to the config.

- **OpenAPI 3.1:** `z.toJSONSchema` (default target, which is JSON Schema 2020-12 and so valid in 3.1; `io: 'input'` for requests, `'output'` for responses). Sorted keys, no random values.
- **Postman v2.1:** written directly from the OpenAPI document (`src/docs/postman.ts`). `openapi-to-postmanv2` was not used because it writes random ids, which would make `check` fail on every run, and it is a large dependency for a small mapping.
- **MSW:** the generated file only calls `toMswHandlers(config, { http, HttpResponse })`. The helper takes `http` from the app's own `msw`, so there is one install and nothing to drift.
- **Swagger UI:** `/docs`, from the pinned `swagger-ui-dist`.
