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
```

All commands take `--config <file>` (default `api/tempo-api.config.ts`) and `--cwd <dir>`. State lives in `.tempo-api/`: `server.pid`, `server.log`, `db.json` and `control-token` (owner-only; the CLI sends it to the internal control routes). `down` only stops the process named in its own pid file, and only after the recorded port answers `/__tempo/health` with that same pid.

The config is TypeScript, loaded with [jiti](https://github.com/unjs/jiti) with `tsconfigPaths`, so it can import app code through aliases such as `@features/*`.

`up` listens on `0.0.0.0` by default so a phone on the same Wi-Fi can use the QR code. Pass `--host 127.0.0.1` to keep it on this machine.

## Runtime entry and generators

`@rn-tempo/dev-api/runtime` exports `createRuntime(config)`: the request pipeline (auth, validate, scenario, data, response check) with an in-memory store, and no `express`, `pino`, `node:*` or faker import. The Express server calls it, and so do the MSW handlers (`toMswHandlers`) and the template's in-app mock adapter. A test checks the import list of `src/runtime`.

`tempo-api openapi | collections | msw | generate | check` write and verify `generated/` next to the config.

- **OpenAPI 3.1:** `z.toJSONSchema` (default target, which is JSON Schema 2020-12 and so valid in 3.1; `io: 'input'` for requests, `'output'` for responses). Sorted keys, no random values.
- **Postman v2.1:** written directly from the OpenAPI document (`src/docs/postman.ts`). `openapi-to-postmanv2` was not used because it writes random ids, which would make `check` fail on every run, and it is a large dependency for a small mapping.
- **MSW:** the generated file only calls `toMswHandlers(config, { http, HttpResponse })`. The helper takes `http` from the app's own `msw`, so there is one install and nothing to drift.
- **Swagger UI:** `/docs`, from the pinned `swagger-ui-dist`.
