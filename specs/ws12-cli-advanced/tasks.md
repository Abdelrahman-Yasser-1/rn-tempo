# WS12 tasks

Format: `- [ ] T<task id> <summary>`. Tick a box in the same commit that completes the task. Each plan task usually maps to several small commits; the plan lists the suggested commit headers.

- [ ] T12.1 `tempo ai sync|report` (wraps syncAi and scripts/ai-log/report.mjs)
- [ ] T12.2 `tempo spec new <name>` and `tempo spec check`
- [ ] T12.3 `tempo upgrade` (diff between templateVersion and latest, patch file, `--apply`)
- [ ] T12.4 `--json` output for every command, shapes documented
- [ ] T12.5 `create-tempo-app` calls `ai sync`
