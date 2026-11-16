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
