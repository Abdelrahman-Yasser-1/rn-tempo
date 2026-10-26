# AI session logging

These scripts keep a local log per AI session in `.ai/sessions/` and add trailers to the commits made during that session. Session logs are local only: `.ai/sessions/` is gitignored and never committed. Commit traceability comes from the `AI-Assisted` and `Spec` trailers.

| Script              | Run by                                                                                               | What it does                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `session-start.mjs` | Claude Code `SessionStart` hook, or `yarn ai:start --tool <tool> --model <model> [--spec specs/<x>]` | Creates the session log and the `.ai/.current.json` pointer (gitignored) |
| `prompt.mjs`        | Claude Code `UserPromptSubmit` hook, or `yarn ai:prompt "<text>"`                                    | Appends the prompt, redacted, to `## Prompts`                            |
| `session-stop.mjs`  | Claude Code `Stop` hook, or `yarn ai:stop --summary "<text>"`                                        | Updates end time, commits, files and `## Summary`                        |
| `add-trailers.mjs`  | lefthook `prepare-commit-msg`                                                                        | Adds `AI-Assisted` and `Spec` trailers (no `AI-Session`)                 |
| `report.mjs`        | `yarn ai:report [--since 30d]`                                                                       | AI-assisted commit stats per tool/model and author                       |
| `lint-edited.mjs`   | Claude Code `PostToolUse` hook                                                                       | Runs eslint and prettier on files the agent edits                        |

## Privacy

- Prompts are redacted before they are written: JWTs, bearer tokens, AWS/GitHub/API keys, private keys, `password=`-style values and emails become `[REDACTED]`.
- Add project-specific patterns to `.ai/redact.json`: `{ "patterns": ["internal\\.example\\.com"] }`.
- Set `ai.logPrompts` in `.tempo.json` to `summary` (first 140 characters) or `off` (no prompt text).
- Set `AI_TRACKING=off` in your shell to skip trailers for a commit.
- Logs are never committed, but they can still contain prompt text, so keep redaction on.

## Tools other than Claude Code

Start a session before working, log each prompt, and stop at the end:

```sh
yarn ai:start --tool cursor --model gpt-5 --spec specs/auth
yarn ai:prompt "Add OTP resend countdown"
yarn ai:stop --summary "Added countdown and tests"
```

Commits made while the session is active (less than 12 hours old) get the trailers automatically.
