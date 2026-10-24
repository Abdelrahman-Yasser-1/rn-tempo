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
