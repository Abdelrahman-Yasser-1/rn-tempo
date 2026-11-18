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
node src/cli.ts create <dir> [--name shop] [--preset empty|products|tempo-template]
node src/cli.ts certs  <dir>                  # mkcert leaf certificate in <dir>/.data/certs (no trust store is changed)
node src/cli.ts check  <dir> --openapi <file> [--json]   # exit 1 when the backend differs from the file
node src/cli.ts snapshot export <dir> <file.zip>
node src/cli.ts snapshot import <file.zip> <dir> [--no-certs]   # into a new or empty folder
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
  - `handler`: `file` (`handlers/<name>.js`), `timeoutMs` (default 5000, at most 30000). See "Handlers" below.
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

## Handlers

A `handler` endpoint runs your JavaScript: `handlers/<name>.js` exports `default async function (ctx)`.

**Handlers are trusted code, not a sandbox.** They run in a worker thread so a loop or a crash cannot stop the
engine (heap limit 128 MB, hard timeout through `worker.terminate()`), but they can read files, use the network and
spawn processes like any Node program. Only open backends you trust.

```js
export default async function (ctx) {
  const total = await ctx.db.count('products');
  ctx.log.info('counted', { total });
  return { status: 200, headers: { 'x-total': String(total) }, body: { total } };
}
```

- **Answer**: `{ status, headers, body }` (an object with only those keys and a numeric `status` from 200 to 599), or any
  other value as the body of a 200 (`undefined` is a 204). A string body with a non-JSON `content-type`, or a
  `Uint8Array`, is sent as is.
- **`ctx.req`**: `{ method, path, params, query, headers, body, user }`. `headers` are the real ones, authorization
  included (the handler is trusted). `body` is the parsed JSON, or the text. `user` is `{ id, username }` on a `bearer`
  endpoint.
- **`ctx.db`**: `list(collection, { where, q, sort: '-price', limit, skip }) -> { rows, total }`, `get`, `count`,
  `create`, `update` (a patch), `delete`. Calls go to the main thread, which owns SQLite, and use the same
  validation and parameterized statements as `crud`. There is no raw SQL.
- **`ctx.users.count()`**: how many app users exist (only the number).
- **`ctx.media`**: `get(id)` and `url(id)`. **`ctx.log`**: `debug info warn error (message, fields)` into
  `.data/logs/engine.log`, fields redacted. `console.log` output is logged too. **`ctx.scenario`**: the picked scenario.
- **Where**: the file must resolve (`realpath`, links included) inside the backend's `handlers/` folder, or the answer is
  a 500. Imports between files in `handlers/` work.
- **Timeout and errors**: a handler that exceeds `timeoutMs` is killed (504, logged, the engine keeps serving). A
  throw, an uncaught error or running out of memory is a 500 with the message.
- **Hot reload**: `handlers/` is watched, and every file is also checked by its modification time per request;
  after a change the workers are replaced, so the next request runs the new code (helpers included).

## Presets

`create <dir> --preset empty|products|tempo-template`. The engine exports `presets` (`{ id, name, description }[]`)
so the desktop app can list them. A preset is plain data written at create time: a `backend.json`, optionally
`seed/*.json` and `handlers/*.js`; nothing is hidden in the engine, and the owner edits all of it afterwards.

**Tempo template** (`src/presets.ts`) is the C13 contract of the template app, with the mock data of
`template/api/endpoints` (a test compares the shapes with `template/api/generated/openapi.json`):

| Endpoint | Type | Notes |
|---|---|---|
| `POST /auth/login`, `/auth/refresh` | `auth` | seeded user `emilys` / `emilyspass` (Emily Johnson, id 1) |
| `GET /auth/me` | `auth` | `bearer` |
| `POST /auth/forgot-password`, `/auth/otp/verify`, `/auth/otp/resend` | `auth` | OTP code `123456`, resend wait 60 s |
| `POST /users/add` | `users` | register |
| `PUT /users/:id` | `users` | `bearer`, only your own profile (403 otherwise) |
| `GET /products`, `/products/search`, `/products/:id` | `crud` on `products` | dummyjson list shape, default limit 30, `q` searches `title` |
| `POST /products/add` | `crud` create | alias of `POST /products`, `unknownFields: "strip"` (the app sends `quantity`, `tags`, ...), every field has the mock's default so `{}` works |
| `GET /app-config` | `static` | see below |
| `POST /media/upload`, `GET /media/:id` | `upload`, `download` | addition |
| `GET /stats/summary` | `handler` | addition: `handlers/stats-summary.js` counts products and users with `ctx.db.count` and `ctx.users.count` |

The 100 products are `seed/products.json` (`Product N`, price `5 + N`, four categories in turn, the
`dummyjson.com/image` thumbnails, rating and stock from `N`). A new product gets id 101, like the mock.
**app-config is a `static` endpoint**, not a collection: a `crud` endpoint cannot serve a single object at
`/app-config` (a list answers `{ app_config: [...] }`, a `get` needs an `:id`), and a handler would hide the shape
from OpenAPI. Flip `maintenance` or `flags` by editing the endpoint body (hot reload); the scenarios
`maintenance` and `forceUpdate` are ready-made.

## Contract check (AC-LB-8)

`check <dir> --openapi <file>` (and the admin route `POST /__admin/contract-check`) compares the backend with an
OpenAPI file such as `template/api/generated/openapi.json`. The file is the contract; the backend must fit it. The
backend side is the engine's own generated OpenAPI (`/__docs/openapi.json`), which now describes `auth`, `users`,
`upload`, `download` and `static` answers too (a `static` body gives a schema inferred from it; a `handler`'s
answer has none).

- **Body of the admin route**: an OpenAPI document (JSON), or `{ "path": "contract.json" }` naming a JSON file
  inside the backend folder (links are resolved and must stay inside, 16 MB at most).
- **Paths** are compared with the server base path in front and parameter names erased (`{id}` = `{productId}`).
- **`missing`**: a path of the file the backend does not have. **`methodMismatches`**: the path exists, not with
  that method. **`extra`**: only in the backend; information, never a failure.
- **`differences`**, per success (2xx) answer of a matched operation, each with the property path
  (`products[].price`, `maintenance.message`):
  - `status`: the file answers 201, the backend 200.
  - `missing-property`: the file requires a property the backend never sends.
  - `not-required`: the file requires it, the backend may leave it out.
  - `type`: a different type (`integer` fits where the file says `number`, not the reverse).
  - `nullable`: the backend can send `null` where the file does not allow it.
  - `enum`: the backend can send a value the file's enum does not list (or has no enum).
  Properties only the backend has, and optional properties it lacks, are not differences. `$ref`, `allOf`, `oneOf`
  with `null` and 3.0 `nullable` are followed; this is not full JSON Schema equivalence (unions, `additionalProperties`,
  string formats and numeric ranges are not compared, request bodies are not compared).
- **`unchecked`**: answers the backend does not describe (a handler), listed as information.
- **Output**: the report as JSON (`ok`, `missing`, `extra`, `methodMismatches`, `differences`, `unchecked`, `counts`);
  the CLI prints text (or the JSON with `--json`) and exits 1 when `ok` is false.

## Snapshots (AC-LB-9)

`snapshot export <dir> <file.zip>` writes one `.zip`; `snapshot import <file.zip> <dir>` restores it into a **new or
empty** folder (anything in it, dot files included, is refused). The admin route `GET /__admin/snapshot` streams the
same zip from a running engine (import is CLI/app side only, because it targets a new folder; the desktop app calls
the CLI).

**Format** (zip, deflate, UTF-8 names, no zip64, so at most 4 GB and 65534 files):

```
manifest.json      format, engineVersion, createdAt, backend name, counts, excluded, note, files[{ path, size, sha256 }]
backend.json
handlers/...       seed/...
data/db.sqlite     a consistent copy (VACUUM INTO, taken in one transaction, so a running engine may keep writing)
media/<xx>/<id>    the stored files (restored to .data/media/)
```

**Never included**: `.data/secrets.json` and `.data/certs/` (the manifest says so in `excluded`), logs, and the
sign-in sessions (`_refresh_tokens` is emptied in the copy). After an import the backend gets **a new JWT secret** the
first time it is served (every old access token is refused) and **no sessions** (old refresh tokens fail), and it
needs **new certificates**: the CLI runs mkcert for them (`--no-certs` skips it; nothing is added to a trust store).
App users and their password hashes are in the database, so the same logins work.

**Export reads only inside the backend folder**: `handlers/`, `seed/`, `.data` and `.data/media` must be real folders
(a symbolic link or a real path outside the backend folder is refused), `backend.json` must be a regular file, and
symbolic links or special files found while walking are skipped, never followed.

**Import checks**, all before anything is written unless noted:
- names: no absolute path, drive letter, `..`, `.`, empty part, backslash or control character; no duplicate (case
  and Unicode folded); only `backend.json`, `manifest.json`, `handlers/`, `seed/`, `data/db.sqlite` and `media/`
  are accepted, so `secrets.json`, `certs/` and anything else is refused;
- no symbolic link or other special file entries, no encryption, only stored and deflate;
- limits against zip bombs: 50,000 entries, 8 GB unpacked in total (declared sizes first, then counted again while
  inflating), no entry may inflate past its declared size, and entries may not overlap (their compressed sizes must
  fit the file);
- `manifest.json` must be valid and list exactly the files in the archive; each file's size, CRC-32 and sha256 are
  checked as it is written (files are created with `wx`, mode 0600, in real folders only);
- the database passes `PRAGMA quick_check`. On any failure what was written is removed.

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
