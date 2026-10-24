# ADR-001: One monorepo for template, CLI, configs and docs

- **Status:** accepted · 2026-10-24

## Context
The template, the CLI that creates projects from it, the shared lint/commit configs and the docs change together. In separate repos they drift: the docs describe old code and the CLI breaks on template changes.

## Decision
Use one repo with Yarn 4 workspaces for `packages/*` and `docs`. `template/` is a standalone RN app with its own lockfile and is **not** a workspace, because Metro and hoisting in a workspace cause subtle native build issues.

## Consequences
- One PR can change the template, the CLI, the docs and the tests together.
- `template/` needs its own `yarn install` and an empty-lockfile guard against parent projects.
- Shared config packages are linked into the template with `link:` (see ADR-011).

## Alternatives
- Separate repos: drift and multi-repo PRs.
- Template as a workspace: Metro and native autolinking trouble.
