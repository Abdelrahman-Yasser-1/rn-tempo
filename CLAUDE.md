@AGENTS.md

## Claude Code notes
- Session logging hooks live in `.claude/settings.json` and call `template/scripts/ai-log/*`. Don't disable them.
- Use the context7 MCP to check library APIs against the versions in `VERSIONS.md`.
- When spawning parallel subagents, give each one its own git worktree and only its workstream's owned paths.
