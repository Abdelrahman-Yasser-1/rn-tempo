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
| `packages/commitlint-config` | Conventional Commits + scopes |
| `packages/contracts` | JSON schemas (`.tempo.json`, feature manifests, AI session logs) + feature-marker utils |
| `packages/{eslint-config,prettier-config,tsconfig}` | Shared configs (WS1) |
| `packages/cli` | `create-tempo-app` / `tempo` (WS5, WS12) |
| `docs/` | Fumadocs site (WS6, WS13), deployed on Vercel |
| `specs/` | Plan, workstream specs, ADRs |
| `.ai/sessions/` | Local AI session logs (gitignored, never committed) |

## Commands
| Where | Command | Purpose |
| --- | --- | --- |
| root | `yarn install` | Install workspaces + git hooks |
| root | `yarn build:tools` | Build the `tempo` CLI and the local backend engine that `template/` runs as `yarn tempo` and `yarn backend` |
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
- While a session is active, commits get `AI-Assisted` and `Spec` trailers (no `AI-Session`). Session logs stay local in `.ai/sessions/` (gitignored): never commit or `git add -f` them.
- Never edit another session's log.

## PRs
- One branch per phase: `ws<N>/<phase>-<slug>`, from an up-to-date `main`, one PR per phase (plan amendment 52).
- Push every commit right after making it (`git push`, never force). Only the integrator force-pushes, with `--force-with-lease`, after a fold.
- Document each task as you finish it: the docs page, ADR or recipe, the `ai/rules` change and the spec checkbox ship in the same PR. Never leave docs for a later phase (amendment 53).
- Use the PR template. Reviewers apply Part E checklists and request `--fixup` commits.
- Merge with **rebase merge** only.

## Saving tokens with code-review-graph
[code-review-graph](https://github.com/tirth8205/code-review-graph) builds a local graph of this repo (functions, imports, calls, tests) and serves it over MCP. AI tools can ask it what a change touches or where a symbol is used instead of reading many files. It is optional and local: nothing about it is committed.

**Install once** (Python 3.10+ and [uv](https://docs.astral.sh/uv/)), from the repo root:
```bash
uv tool install code-review-graph==2.4.0
code-review-graph build --repo .   # about 20 s; writes .code-review-graph/ (gitignored, about 200 MB)
```

**Connect your tool** (from the repo root):
| Tool | Command |
| --- | --- |
| Claude Code | `claude mcp add -s local code-review-graph -- code-review-graph serve --repo "$PWD" --auto-watch` |
| Codex | `codex mcp add code-review-graph -- code-review-graph serve --repo "$PWD" --auto-watch` |
| Others | Add a stdio MCP server running `code-review-graph serve --repo <repo root> --auto-watch` to your user or local config |

Don't run `code-review-graph install` here. It rewrites the committed `.claude/settings.json`, `CLAUDE.md` and `.gitignore`, adds a `.mcp.json` with your absolute path, and adds steps to the lefthook git hooks.

**Use it before reading lots of files.** For a review, an impact question or "where is X used":
1. Call `get_minimal_context_tool(task="<your task>")` first.
2. Then `detect_changes_tool`, `query_graph_tool` (`callers_of`, `importers_of`, `tests_for`) or `semantic_search_nodes_tool`, with `detail_level="minimal"`.
3. Read only the files they point to. Still read the code and its tests before you change them; the graph narrows the search, it does not replace the source.

Without MCP, use the CLI:
- `code-review-graph detect-changes --brief --repo . --base main`: what this branch changes, its risk, and test gaps.
- `code-review-graph query callers_of <name> --repo .` (also `importers_of`, `tests_for`, `file_summary`).
- `code-review-graph search <text> --repo .`

`--auto-watch` keeps the graph current while the MCP server runs. Otherwise run `code-review-graph update --repo .` after switching branches or pulling. To remove it: `claude mcp remove code-review-graph -s local` (or `codex mcp remove code-review-graph`), `rm -rf .code-review-graph`, and `uv tool uninstall code-review-graph`.
