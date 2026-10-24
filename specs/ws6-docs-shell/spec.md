---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS6 — Docs shell (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `docs/**`, plus moving the ADRs from `specs/adr` into `docs/content/docs/adr`.

## Acceptance criteria
- **AC-1** Every task below is done and its "Done when" checks (in `PLAN.md`) pass.
- **AC-2** `yarn verify` (or the workspace test/lint) passes in CI.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS6 — Docs shell (Wave 1)
**Owns:** `docs/**`, plus moving the ADRs from `specs/adr` into `docs/content/docs/adr`.

**6.1 Fumadocs app**
- Scaffold with `npm create fumadocs-app` (Next.js, fumadocs-mdx), choosing the options that match RN-TEMPO's docs setup.
- Then copy over RN-TEMPO's useful bits — the `llms.txt`, `llms-full.txt` and `llms.mdx` routes and OG images — via `gh api repos/Abdelrahman-Yasser-1/RN-TEMPO/contents/docs/src/...`.
- Pin the §B3 versions.
- **Commit:** `feat(docs): scaffold fumadocs site`

**6.2 Information architecture**
- `content/docs/meta.json` sections (folders):
  - `getting-started`
  - `architecture`
  - `walkthrough`
  - `features`
  - `standards`
  - `ai`
  - `recipes`
  - `cli`
  - `upgrades`
  - `adr`
  - `project-docs`
- Each folder gets a `meta.json` and an `index.mdx` stub with a "coming in WS13" callout.
- **Commit:** `docs(docs): add information architecture`

**6.3 Custom MDX components** (`docs/src/components/mdx/`)
- `FileTree`: use the built-in one if Fumadocs provides it; otherwise build it.
- `AnnotatedCode`: props `file` (path relative to the repo root), `region?`, `highlight?`, `title?`. It reads the file at build time, extracts the `#region`, renders it with Shiki, and accepts child `<Note line={n}>` annotations shown beside the code. **The build fails if the file or region is missing.**
- `DoDont`: two code blocks, ❌ and ✅.
- `RuleCard`: rule name, severity badge, link, description, children examples.
- `EnvMatrix`: renders §B2 from `template/.tempo.json`.
- `CommandTabs`: yarn/npm tabs.
- `Mermaid`: client-side.
- `FeatureBadge`: module name and whether it's removable.
- **Commit:** one per 2 components.

**6.4 Seed pages**
- getting-started/{prerequisites, create-project, run-envs, troubleshooting}
- architecture/{overview, folder-structure (FileTree from §C5), boundaries (Mermaid of the §WS1 task 1.5 matrix), data-flow}
- The 12 ADRs
- **Commit:** `docs(docs): add getting started and architecture pages`

**6.5 Deploy**
- `.github/workflows/docs.yml`: build on PR; deploy on main to GitHub Pages via a Next static export, if fumadocs supports it with search (static search index). Otherwise Vercel — **ask the owner**.
- **Commit:** `ci(docs): add docs build and deploy`

---
