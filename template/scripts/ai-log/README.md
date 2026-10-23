# AI session logging

Every AI-assisted change is traceable to the prompts that produced it. These scripts keep a log per AI session in `.ai/sessions/` and add trailers to the commits made during that session.

| Script | Run by | What it does |
| --- | --- | --- |
| `session-start.mjs` | Claude Code `SessionStart` hook, or `yarn ai:start --tool <tool> --model <model> [--spec specs/<x>]` | Creates the session log and the `.ai/.current.json` pointer (gitignored) |
| `prompt.mjs` | Claude Code `UserPromptSubmit` hook, or `yarn ai:prompt "<text>"` | Appends the prompt, redacted, to `## Prompts` |
| `session-stop.mjs` | Claude Code `Stop` hook, or `yarn ai:stop --summary "<text>"` | Updates end time, commits, files and `## Summary` |
| `add-trailers.mjs` | lefthook `prepare-commit-msg` | Adds `AI-Assisted`, `AI-Session` and `Spec` trailers |
| `stage-session.mjs` | lefthook `pre-commit` | Stages the session log with the commit |
| `report.mjs` | `yarn ai:report [--since 30d]` | AI-assisted commit stats per tool/model and author |
| `lint-edited.mjs` | Claude Code `PostToolUse` hook | Runs eslint and prettier on files the agent edits |

## Privacy

- Prompts are redacted before they are written: JWTs, bearer tokens, AWS/GitHub/API keys, private keys, `password=`-style values and emails become `[REDACTED]`.
- Add project-specific patterns to `.ai/redact.json`: `{ "patterns": ["internal\\.example\\.com"] }`.
- Set `ai.logPrompts` in `.tempo.json` to `summary` (first 140 characters) or `off` (no prompt text).
- Set `AI_TRACKING=off` in your shell to skip trailers and staging for a commit.

## Tools other than Claude Code

Start a session before working, log each prompt, and stop at the end:

```sh
yarn ai:start --tool cursor --model gpt-5 --spec specs/auth
yarn ai:prompt "Add OTP resend countdown"
yarn ai:stop --summary "Added countdown and tests"
```

Commits made while the session is active (less than 12 hours old) get the trailers automatically.
