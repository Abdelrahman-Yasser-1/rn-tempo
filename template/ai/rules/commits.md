---
description: Conventional Commits with required scope, commit size, and the AI session trailers.
globs: .github/**,commitlint.config.mjs,lefthook.yml
---

# Commits

Format `type(scope): subject`. commitlint (`@rn-tempo/commitlint-config`) enforces it locally (lefthook `commit-msg`) and in CI.

- **Types:** `feat fix docs style refactor perf test build ci chore revert`.
- **Header:** at most 100 characters, imperative, lowercase subject, no trailing period. **A scope is required.**
- **Scopes:**
  - repo: `repo template packages cli contracts eslint-config prettier-config commitlint-config tsconfig docs docs-content specs ai ci release deps`
  - app infra: `native android ios env app navigation theme i18n http storage security flags remote-config logger network toast`
  - shared code: `ui hooks utils`
  - features: `auth home profile settings items onboarding forms`
  - tooling: `e2e test storybook fastlane vscode`
  - Your own feature names are added in `commitlint.config.mjs` (`createConfig({ extraScopes })`).
- **Size:** one logical change per commit, about 200 changed lines at most (lockfiles and generated files excluded). No refactor and feature in one commit. Dependency changes are their own `deps` commit. Generated native files get their own `chore(<scope>): regenerate ...` commit.
- Every commit passes `yarn verify:changed` first. Never use `--no-verify`.
- Tick the matching `tasks.md` checkbox in the same commit that finishes the task.

## AI trailers

While an AI session is active (`.ai/.current.json`, under 12 h old and `AI_TRACKING` not `off`) the `prepare-commit-msg` hook appends:

```
AI-Assisted: claude-code/claude-sonnet-5-5
AI-Session: .ai/sessions/2026-10-24-2115-claude-code-ab12cd.md
Spec: specs/ws3-core-infra
```

- `Spec:` appears only if the session has a spec. commitlint rejects `AI-Assisted` without a matching, existing `AI-Session` file.
- Claude Code starts and stops sessions through `.claude/settings.json` hooks. Other tools run `yarn ai:start --tool <tool> --model <model> [--spec specs/<feature>]`, `yarn ai:prompt "<text>"` per prompt, and `yarn ai:stop --summary "<text>"` at the end (the `/log` command does this).
- Never edit a session log another session created. Never write the trailers by hand.

```
# ✅
feat(items): add item details screen
fix(http): retry once after token refresh

# ❌
Add item details screen.        (no type, no scope, capitalised, period)
feat: add item details          (scope missing)
feat(items): Added things.      (past tense, period)
```
