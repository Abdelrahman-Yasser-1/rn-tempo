# AGENTS.md — RN-TEMPO repo

Guide for every contributor, human or AI agent, working on **this repo** (the template, CLI, configs and docs). Projects created from the template get their own `template/AGENTS.md` (WS7).

## Start here
1. Read [`specs/PLAN.md`](specs/PLAN.md): Part A (rules), Part C (contracts), and the **Amendments** section at the end, which wins over the rest.
2. Find your workstream in `specs/ws<N>-<slug>/`. `spec.md` lists the paths you own and the acceptance criteria; `tasks.md` is your checklist.
3. If anything is unspecified or ambiguous, **stop and ask**. Never invent.

## Repo map
| Path | What |
| --- | --- |
| `template/` | RN 0.88 app = the template (own `yarn.lock`, not a workspace) |
| `packages/commitlint-config` | Conventional Commits + scopes + `ai-session-trailer` rule |
| `packages/contracts` | JSON schemas (`.tempo.json`, feature manifests, AI session logs) + feature-marker utils |
| `packages/{eslint-config,prettier-config,tsconfig}` | Shared configs (WS1) |
| `packages/cli` | `create-tempo-app` / `tempo` (WS5, WS12) |
| `docs/` | Fumadocs site (WS6, WS13), deployed on Vercel |
| `specs/` | Plan, workstream specs, ADRs |
| `.ai/sessions/` | AI session logs for this repo |

## Commands
| Where | Command | Purpose |
| --- | --- | --- |
| root | `yarn install` | Install workspaces + git hooks |
| root | `yarn test` / `yarn lint` / `yarn typecheck` | All workspaces |
| root | `node scripts/versions-report.mjs > VERSIONS.md` | Refresh the versions report |
| `template/` | `yarn install && yarn pods` | Install the app (`yarn pods` arrives in WS2; until then `cd ios && bundle exec pod install`) |
| `template/` | `yarn tsc --noEmit && yarn jest` | Typecheck and test (becomes `yarn verify` in WS1) |
| `template/` | `yarn test:ai-log` | AI logging script tests |

## Golden rules
1. Touch only the paths your workstream owns.
2. Check library APIs with context7 for the **pinned** version. Never from memory.
3. No new, removed or upgraded dependencies unless the task says so. Pins are exact.
4. Small Conventional Commits (≤ ~200 lines), each one green. Dependency changes go in separate `deps` commits.
5. No `any`, no `@ts-ignore`, no unexplained `eslint-disable`, no `console`. UI strings go through i18n (en + ar), styles through theme tokens.
6. Tests in the same commit or the next one. Jest test names for spec'd features start with `AC-n:`.
7. Contracts (Part C, `packages/contracts`) change only through the integrator, with an ADR.
8. Paste your "Done when" command output into the PR. Never claim done with failing checks.

## Commits and AI tracking
- Format: `type(scope): subject`. Scopes are in `packages/commitlint-config/index.mjs`, and a scope is required.
- Claude Code logs sessions automatically through `.claude/settings.json` hooks. Other tools: `cd template && yarn ai:start --tool <tool> --model <model> --spec specs/ws<N>-<slug>`, then `yarn ai:prompt "<prompt>"` per prompt and `yarn ai:stop --summary "<summary>"` at the end.
- While a session is active, commits get `AI-Assisted`, `AI-Session` and `Spec` trailers, and the session log is staged with them.
- Never edit another session's log.

## PRs
- Branch `ws<N>/<task-id>-<slug>` from `main`, one worktree per parallel agent.
- Use the PR template. Reviewers apply Part E checklists and request `--fixup` commits.
- Merge with **rebase merge** only.
