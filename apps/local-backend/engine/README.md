# Tempo Local Backend engine

The engine behind Tempo Local Backend (WS15 Phase Y). It serves a **backend folder** as a real API: a
`backend.json` definition, a SQLite database (`node:sqlite`, no native addon), HTTPS, a request log and
generated OpenAPI docs. There is no UI here; the desktop app (Y4) spawns `serve` and talks to its admin port.
The full user guide arrives in Y6.

```
my-backend/
  backend.json        # definition (committable)
  seed/*.json         # optional seed rows (committable)
  .data/              # db.sqlite, certs/, logs/  (gitignored by its own .gitignore)
```

## Commands

```sh
node src/cli.ts create <dir> [--name shop] [--preset empty|products]
node src/cli.ts certs  <dir>                  # mkcert leaf certificate in <dir>/.data/certs (no trust store is changed)
node src/cli.ts serve  <dir> [--port 8443] [--http] [--admin-port N] [--no-watch]
```

`serve` listens on `0.0.0.0:<port>` (HTTPS when `.data/certs` holds `cert.pem` and `key.pem`, otherwise
HTTP with a notice). It prints **one JSON line** on stdout when ready, with the admin port and a per-launch
token. Nothing else ever prints the token.

## backend.json

Validated by a Zod schema (`src/schema.ts`); the JSON Schema is `schemas/backend.schema.json` (`yarn schema`
rewrites it, a test keeps it in sync).

- `collections[]`: `name`, `fields[]` (`string number boolean date enum json relation media`, `required`,
  `unique`, `default`, `enumValues`, `relationTo`), optional `seed` (rows, or a file in `seed/`). Names match
  `^[a-z][a-zA-Z0-9_]{0,62}$`; they are the only text that becomes an SQL identifier, and always quoted.
- `endpoints[]`: `id`, `method`, `path`, `type`, `auth`, `scenarios`, plus type settings.
  - `crud`: `collection`, `action` (`list get create update delete`), `listShape` (`dummyjson` or `paged`),
    `searchFields`, `hiddenFields`, `unknownFields`, `deleteMarkers`, `aliases` (for example `/products/add`).
  - `static`: `status`, `headers`, `body`.
  - `auth`, `upload`, `download`, `handler` are accepted and answer 501 until Y2.
- Paths starting with `/__` are reserved for the engine (`/__health`, `/__docs`).

List queries: `limit`/`skip` or `page`/`pageSize`, `sort=field` / `-field` (also `sortBy`+`order`), equality
filters `?field=value`, `q` search. Errors are `application/problem+json` naming the field.

Scenarios (`status`, `delayMs`, `body`, `headers`) are picked with the `x-tempo-scenario` header or the admin
API. The built-ins of dev-api (`notFound`, `serverError`, `slow`...) exist on every endpoint.

## Migrations

A definition change migrates the database in one transaction: add column, drop column, rename (an explicit
admin call, because a diff cannot tell a rename from drop plus add), add/drop collection, unique indexes.
Dropping a column or collection (and changing a field's type) needs `?confirm=true`; without it the admin API
answers 409 with what would be lost. A `backend.json` edit on disk that would delete data is refused and the
old definition keeps running.

## Two listeners

| | Public | Admin |
|---|---|---|
| Address | `0.0.0.0:<port>` | `127.0.0.1:<random>` |
| Auth | per endpoint | per-launch token (`Authorization: Bearer` or `x-tempo-token`) |
| Routes | your endpoints, `/__health`, `/__docs` | `/__admin/...` only |

The public listener answers 404 for every `/__admin` route (tested). The admin listener also rejects a
non-loopback `Host`. Admin routes: `definition` (get/put), `endpoints`, `collections` and field ops
(`rename` included), `data` (row browser), `scenarios`, `requests`, `events` (SSE), `stats`, `openapi`, `reload`,
`info`.

## Hot reload, logs, docs

- Admin changes and `backend.json` edits (debounced file watch) rebuild the route table in one assignment;
  requests already running finish on the old table.
- Request log: ring buffer plus SSE, redacted with dev-api's redaction, and `.data/logs/requests-YYYY-MM-DD.jsonl`
  (7 days, 50 MB cap). Engine log: `.data/logs/engine.log`.
- `/__docs` is Swagger UI and `/__docs/openapi.json` the OpenAPI 3.1 document, built from the running definition.

## Development

```sh
yarn workspace @rn-tempo/local-backend-engine test
yarn workspace @rn-tempo/local-backend-engine typecheck
yarn workspace @rn-tempo/local-backend-engine lint
yarn workspace @rn-tempo/local-backend-engine build   # dist/cli.mjs
```
