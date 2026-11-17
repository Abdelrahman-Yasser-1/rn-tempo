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
  - `auth`: `action` is `login refresh me logout register updateMe forgotPassword otpVerify otpResend`; see
    "App users and auth" below.
  - `users`: `action` `add` (`POST /users/add`), `update` (`PUT /users/:id`), `get`: the C13 user routes on
    the built-in app users.
  - `upload`: `maxBytes`, `multiple`. `download`: the path needs an `:id` segment. See "Media" below.
  - `handler`: accepted and answers 501 until the next commit of Y2.
- Paths starting with `/__` are reserved for the engine (`/__health`, `/__docs`).

List queries: `limit`/`skip` or `page`/`pageSize`, `sort=field` / `-field` (also `sortBy`+`order`), equality
filters `?field=value`, `q` search. Errors are `application/problem+json` naming the field.

Scenarios (`status`, `delayMs`, `body`, `headers`) are picked with the `x-tempo-scenario` header or the admin
API. The built-ins of dev-api (`notFound`, `serverError`, `slow`...) exist on every endpoint.

## App users and auth

Built-in tables (their names start with `_`, which no collection name can) live in the same SQLite file:
`_users`, `_refresh_tokens` (and `_media`). A request to a `bearer` endpoint is verified for real now.

- **Passwords**: scrypt (`N=16384, r=8, p=1`, a random salt), stored as `scrypt$N$r$p$salt$hash`, so the
  parameters can change later. Verification is constant time, and a missing user costs the same work as a wrong
  password. The hash never appears in any response, admin routes included (tested).
- **Access token**: a JWT HS256 made with `node:crypto`, payload `{ sub, iat, exp, typ: "access" }`. Only
  `alg: HS256` is accepted (`none` and every other algorithm are refused), the signature is compared with
  `timingSafeEqual`, and `exp` must be a finite number after `iat` and in the future. The secret is 32 random bytes in
  `.data/secrets.json` (mode 0600, created with `O_EXCL|O_NOFOLLOW`, never logged, never returned). Removing the
  file signs everyone out. A disabled or deleted user is refused on the next request, even with a valid token.
- **Lifetimes**: `auth.accessTtlMin` (30) and `auth.refreshTtlDays` (30). C13's `expiresInMins` is honoured but
  clamped to `min(requested, auth.maxAccessTtlMin (60), 1440)`.
- **Immediate sign-out**: each user has a `tokenVersion`, put in the access token as `ver`. A token whose `ver` is
  not the current one is refused. The version is bumped by a password change (`updateMe`, admin reset), disable and
  enable, revoke-all and "log out everywhere", so tokens already issued stop working at once. `updateMe` with a
  new password also revokes all refresh tokens and answers with a fresh `accessToken`/`refreshToken` pair.
- **Refresh tokens** are opaque random strings, stored as a sha256. Every refresh rotates: the old token is
  revoked and a new one issued in the same family. Using a revoked token revokes the whole family and answers
  401. A sign-in starts a new family. `logout` revokes the given token's family, or every session of the caller.
- **Answers match C13**: `login` is `User & { accessToken, refreshToken }`, `refresh` is `{ accessToken, refreshToken }`,
  `me` is `User`. Wrong credentials are `400 { message: "Invalid credentials" }`; a disabled user is 403.
- **Mocks kept**: `forgotPassword` always answers `{ success: true }`; `otpVerify` accepts `auth.otpCode`
  (default `123456`); `otpResend` answers `retryAfterSec` from `auth.otpResendSec` (60).
- **Seeding**: `auth.seedUsers` (`username`, `password`, optional profile fields). Passwords are hashed on
  seed. A username is seeded once; deleting a seeded user keeps it deleted.
- **`ownerField`** on a `crud` endpoint (needs `auth: "bearer"`): lists show only the caller's rows, other rows
  answer 404, and writes force the field to the caller's id.
- **Admin routes**: `GET/POST /users`, `GET/PUT/PATCH/DELETE /users/:id`, `POST /users/:id/password`,
  `.../disable`, `.../enable`, `.../revoke`, `GET /sessions` (no hashes), `DELETE /sessions/:id`.
- **Logs**: dev-api redacts `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `secret`, `jwtSecret`,
  `code` and more by key name at any depth. `code` stays redacted (it is only the request log; the OTP check
  itself still sees it), because an OTP is a credential.

## Media

- **Storage**: files live at `.data/media/<id[0..2]>/<id>`, `id` being 16 random bytes in hex, with their metadata
  (`originalName`, `mime`, `size`, `sha256`, `createdAt`, `uploadedBy`) in the `_media` table. No path is ever
  built from a request: a download id must match `^[0-9a-f]{32}$`, and names are metadata only (folders and control
  characters are stripped). An upload streams to `.data/media/.tmp` (`O_EXCL|O_NOFOLLOW`), then is renamed into place;
  leftovers of a crash are removed at start.
- **`upload` endpoint**: a multipart `file` field (several parts when `multiple: true`, answering `{ files }`), or a raw
  body whose `Content-Type` is the file's type (name from `?name=` or `x-file-name`). It answers
  `201 { id, url, name, mime, size }`. The limit is `media.maxBytes` (100 MB) or the endpoint's `maxBytes`, enforced as
  bytes arrive: the temp file is deleted and the answer is `413` (`connection: close`). A declared `Content-Length`
  over the limit is refused before anything is read. A multipart request with several files keeps all or none.
- **Type**: from the bytes (png, jpeg, gif, webp, bmp, ico, tiff, heic, avif, mp4, mov, webm, avi, mp3, wav, ogg, flac,
  m4a, pdf, zip, gzip, svg, html, json), else the declared type (sanitized to `type/subtype`), else `text/plain` for
  text, else `application/octet-stream`.
- **`download` endpoint** (`GET /media/:id`): `Content-Type`, `Content-Length`, `ETag` (304 on `If-None-Match`),
  `Accept-Ranges`, one `Range` (206, or 416 with `Content-Range: bytes */size`; several ranges get the whole file),
  `X-Content-Type-Options: nosniff`, a sandboxing `Content-Security-Policy`, and `Content-Disposition` that is
  `inline` only for images (not SVG), video and audio; everything else, SVG and HTML included, is `attachment`, with
  an ASCII `filename` and an RFC 5987 `filename*`.
- **`media` fields** store ids (and a write is refused when the file does not exist). A crud endpoint's `media`
  setting shows them as the `id` (default), a `url`, or an `object` `{ id, url, name, mime, size }`. URLs point at the
  first `download` endpoint (else `/media/<id>`).
- **Admin routes**: `GET /media` (paging, `type=image` or `type=image/png`, `q`), `GET /media/:id`,
  `GET /media/:id/file`, `POST /media` (upload), `DELETE /media/:id` (removes the file), `GET /media/usage`.

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
