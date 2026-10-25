@AGENTS.md

# Claude Code notes

- The rules in `ai/rules/` apply to every change. Skills (`.claude/skills/`), commands (`/spec`, `/plan`, `/implement`, `/new-feature`, `/new-screen`, `/test`, `/review`, `/verify`, `/log`) and subagents (`code-reviewer`, `test-writer`, `a11y-auditor`, `spec-writer`) are generated from `ai/`. Edit `ai/`, then run `yarn ai:sync`; never edit `.claude/skills`, `.claude/commands` or `.claude/agents` directly.
- Session logging is automatic through the hooks in `.claude/settings.json`. Do not remove them. `PostToolUse` runs eslint and prettier on files you edit.
- Use the context7 MCP server (`.mcp.json`) to check library APIs for the pinned versions before using them.
- Run `yarn verify:changed` before you say a task is done, and paste its trimmed output.
- Ask before adding dependencies, changing native projects by hand, or touching files outside the task.
