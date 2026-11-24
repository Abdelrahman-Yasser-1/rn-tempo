import { pathToFileURL } from 'node:url';

import { defineCommand } from 'citty';

import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { projectScript, runProjectScript } from '../lib/project-script.ts';

type SyncModule = {
  toolsFromConfig(cwd: string): string[];
  syncAi(options: { cwd: string; tools: string[]; check: boolean }): { written: string[]; removed: string[] };
};

const sync = defineCommand({
  meta: { name: 'sync', description: 'Generate AI tool files from the project’s ai/ folder' },
  args: {
    ...commonArgs,
    check: { type: 'boolean', description: 'Report drift without writing files' },
    tools: { type: 'string', description: 'Override the configured tools with a comma-separated list' },
  },
  async run({ args }) {
    const { cwd, json } = resolveCommon(args);
    await runGuarded(json, async (reporter) => {
      const file = await projectScript(cwd, 'scripts/ai-sync/sync.mjs', 'AI_SCRIPTS_MISSING');
      const module: SyncModule = await import(pathToFileURL(file).href);
      const tools = args.tools ? args.tools.split(',').map((tool) => tool.trim()) : module.toolsFromConfig(cwd);
      const check = Boolean(args.check);
      const { written, removed } = module.syncAi({ cwd, tools, check });
      for (const file of written) reporter.info(`${check ? 'out of date' : 'wrote'}  ${file}`);
      for (const file of removed) reporter.info(`${check ? 'stale' : 'removed'}  ${file}`);
      reporter.info(`ai sync (${tools.join(', ')}): ${written.length} changed, ${removed.length} removed`);
      const ok = !check || written.length + removed.length === 0;
      reporter.result({ ok, check, written, removed });
      if (!ok) process.exitCode = 1;
    });
  },
});

const report = defineCommand({
  meta: { name: 'report', description: 'Report AI-assisted commits by tool and author' },
  args: { ...commonArgs, since: { type: 'string', description: 'Commit history window (project default: 30d)' } },
  async run({ args }) {
    const { cwd, json } = resolveCommon(args);
    await runGuarded(json, async (reporter) => {
      const file = await projectScript(cwd, 'scripts/ai-log/report.mjs', 'AI_SCRIPTS_MISSING');
      const { stdout, exitCode } = await runProjectScript(cwd, file, args.since ? ['--since', args.since] : []);
      if (stdout) (json ? process.stderr : process.stdout).write(`${stdout}\n`);
      reporter.result({ ok: exitCode === 0, summary: stdout });
    });
  },
});

export default defineCommand({
  meta: { name: 'ai', description: 'Manage project AI tool files and report AI-assisted commits' },
  subCommands: { sync, report },
});
