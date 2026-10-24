---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS7 — AI layer (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/ai/**`, `template/AGENTS.md`, `template/CLAUDE.md`, `template/.claude/**` (except `settings.json` hooks, already done in WS0; WS7 may add permissions), `template/.cursor/**`, `template/.github/copilot-instructions.md`, `template/.github/instructions/**`, `template/.mcp.json`, `template/specs/**` (templates), `template/PROJECT.md`, and `packages/cli/src/ai/**` (the sync module only; coordinate with WS5 via the contract below).

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS7 — AI layer (Wave 1)
**Owns:** `template/ai/**`, `template/AGENTS.md`, `template/CLAUDE.md`, `template/.claude/**` (except `settings.json` hooks, already done in WS0; WS7 may add permissions), `template/.cursor/**`, `template/.github/copilot-instructions.md`, `template/.github/instructions/**`, `template/.mcp.json`, `template/specs/**` (templates), `template/PROJECT.md`, and `packages/cli/src/ai/**` (the sync module only; coordinate with WS5 via the contract below).

**7.1 AI source** (`template/ai/`)

`rules/*.md`: one topic per file. Each file has a 1-line summary at the top, then ✅/❌ examples. Every rule must match the lint and contracts — **copy from §C, never paraphrase loosely**.

| File | Covers |
|---|---|
| `architecture` | §C5, §WS1 task 1.5 matrix |
| `styling` | Unistyles, tokens, no literals |
| `state` | Zustand for client state vs Query for server state, no tokens in stores |
| `api` | `request()` + Zod; query keys factory; mutations invalidate |
| `i18n` | §C11 |
| `a11y` | §WS4 rules |
| `testing` | renderWithProviders, MSW, `getByRole`, AC IDs |
| `naming` | §C5 |
| `security` | env, secrets, pinning |
| `commits` | §C10 + AI trailers |
| `specs` | §C16 flow |
| `generators` | "always use `yarn tempo g …` instead of hand-creating files" |
| `verification` | "run `yarn verify:changed` before finishing; never claim done with failing checks" |

`skills/<name>/SKILL.md`, each with frontmatter `name` and `description` (when to use) and steps that call the CLI and `yarn verify:changed`:

| Skill | Purpose |
|---|---|
| `spec-new` | Draft `spec.md` from a feature request; ask clarifying questions; AC IDs |
| `spec-plan` | Write `design.md` + `tasks.md` from an approved spec |
| `spec-implement` | Execute `tasks.md` one task per commit; update checkboxes |
| `create-feature` | — |
| `add-screen` | — |
| `add-component` | — |
| `write-tests` | — |
| `add-env` | — |
| `upgrade-rn` | Use the upgrade helper diff and the `tempo upgrade` output |
| `review-pr` | Apply the §E1 checklist adapted for projects |
| `a11y-audit` | — |

Other sources:
- `commands/*.md`: `spec`, `plan`, `implement`, `new-feature`, `new-screen`, `test`, `review`, `verify`, `log` (runs `yarn ai:start`/`ai:stop` for non-Claude tools).
- `agents/*.md`: `code-reviewer`, `test-writer`, `a11y-auditor`, `spec-writer`. Each has a role, the tools it may use, a checklist, and the output format.
- **Commits:** `docs(ai): add rules`, `feat(ai): add skills`, `feat(ai): add commands and agents`.

**7.2 Root agent docs**
- `template/AGENTS.md`, ≤ 250 lines, with sections:
  - Project overview (points to `PROJECT.md`)
  - Stack
  - Commands table
  - Folder map
  - Golden rules (top 15)
  - Where the rules live (`ai/rules`)
  - Specs flow
  - AI session logging
  - Docs `llms.txt` URL
- `CLAUDE.md`: `@AGENTS.md` import plus Claude-only notes.
- `PROJECT.md`: a template with sections Product, Domain glossary, Environments and URLs, Integrations, Deviations from template (each links an ADR), Team contacts, Release process.
- **Commit:** `docs(ai): add agents guide and project template`

**7.3 Sync module** (`packages/cli/src/ai/sync.ts`; WS12 wires it into a command)
- `syncAi({ cwd, tools: ('claude'|'cursor'|'copilot')[] })` reads `ai/` and writes:
  - **claude:** `.claude/skills/<name>/SKILL.md` (copy), `.claude/commands/<name>.md`, `.claude/agents/<name>.md`.
  - **cursor:** `.cursor/rules/<rule>.mdc` with frontmatter `description`, `globs` (from a `globs:` line in each rule's frontmatter) and `alwaysApply` (architecture, naming, verification = true); `.cursor/mcp.json` from `.mcp.json`.
  - **copilot:** `.github/copilot-instructions.md` (AGENTS.md condensed with links), plus `.github/instructions/<rule>.instructions.md` with `applyTo` globs.
- Generated files carry the header `<!-- generated by tempo ai sync from ai/… — edit the source -->`.
- **Idempotent:** a second run produces no diff (test).
- The template commits the generated outputs, so a project works before the CLI is installed.
- **Commits:** `feat(cli): add ai sync module`, then `chore(ai): generate tool-specific ai files`.

**7.4 MCP**
- `template/.mcp.json`:
  - `context7` (`npx -y @upstash/context7-mcp`)
  - `github` (the official GitHub MCP server via its remote URL, auth by env)
  - `figma` (Figma Dev Mode MCP local URL `http://127.0.0.1:3845/mcp`, documented as optional)
  - `maestro` (`maestro mcp`; requires the Maestro CLI)
- Verify each server's current launch command in its docs.
- The docs `llms.txt` URL is referenced in AGENTS.md, since it's not an MCP server.
- **Commit:** `feat(ai): add mcp configuration`

**7.5 Spec templates** (`template/specs/`)
- `README.md`: lifecycle and statuses.
- `product.md` and `tech.md` templates.
- `_templates/{spec,design,tasks}.md` with sections exactly as in §C16, including the AC-ID format and the task line format `- [ ] T1 (AC-1) <imperative summary> — commit: <type>(<scope>): <subject>`.
- `scripts/spec-check.mjs`: scans `specs/*/spec.md` for AC IDs and test files for `AC-n` in test names or Maestro `tags`, and reports any uncovered AC. Script: `"spec:check"`.
- **Commit:** `feat(specs): add spec templates and coverage check`

**7.6 PR "AI changes" comment action**
- `template/.github/workflows/ai-report.yml`: on `pull_request`, find the session files changed in the PR plus the trailers in the PR commits, and build a markdown comment (sessions, tool/model, prompts collapsed in `<details>`, commits). Upsert it via `marocchino/sticky-pull-request-comment`.
- Mirror it in the repo root `.github/workflows/`.
- **Commit:** `ci(ai): add ai changes pr report`

---
