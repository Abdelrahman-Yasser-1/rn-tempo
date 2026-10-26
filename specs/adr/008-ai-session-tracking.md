# ADR-008: Track AI changes with session logs and commit trailers

- **Status:** accepted · 2026-10-24

## Context
Reviewers need to know which changes were AI-made and from which prompts, without extra manual work.

## Decision
- Session logs live in `.ai/sessions/*.md` (committed). They hold the prompts, redacted before writing, plus a summary, the files and the commits.
- Commits made during a session get `AI-Assisted`, `AI-Session` and `Spec` trailers.
- Claude Code hooks write the logs automatically. Other tools use `yarn ai:start|prompt|stop`.
- commitlint rejects `AI-Assisted` without a valid `AI-Session`.

## Consequences
- Full traceability in git history.
- Prompts are committed, so redaction and the `ai.logPrompts` setting (`full|summary|off`) matter.
- Scripts have no dependencies, so they run from git hooks before install.

## Revision (2026-10-26)
Session logs are now **local only**. `.ai/sessions/` is gitignored (in the root and in the template, so generated projects ignore it too), and the files are no longer committed or staged. Logging still works: the hooks and `yarn ai:*` scripts keep writing the local files.

Why: the owner preferred not to commit prompt logs, and the committed logs added repo noise (one file per session in every PR).

What changed:
- Commits keep the `AI-Assisted: <tool>/<model>` trailer and the optional `Spec:` trailer. The `AI-Session` trailer and the `stage-session` hook are removed.
- The commitlint `ai-session-trailer` rule is removed. Older commits that still carry an `AI-Session` trailer are accepted.
- The PR AI report is built from commit trailers only (count, grouping by tool/model, commits per group).
- Commit traceability stays through the trailers. The session log schema (C9) still describes the local files.
