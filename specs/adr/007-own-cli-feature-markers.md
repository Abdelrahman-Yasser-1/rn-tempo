# ADR-007: Own CLI with feature markers instead of `--template` only

- **Status:** accepted · 2026-10-24

## Context
The RN community `--template` mechanism only renames placeholders. It cannot remove optional modules (SSL pinning, Storybook…) or configure per-env bundle IDs.

## Decision
- `create-tempo-app` fetches the template at a tag, renames identifiers, and strips unselected modules.
- Modules are delimited by marker comments (`@tempo-feature:<name>:start|end`) and described by manifests in `.tempo/features/`.
- The template stays fully runnable with every module present.
- Marker parsing lives in `@rn-tempo/contracts`.

## Consequences
- CI must build both "all on" and "minimal" variants.
- Marker hygiene is checked in CI.
