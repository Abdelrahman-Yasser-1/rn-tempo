import { confirm } from '@clack/prompts';
import { defineCommand } from 'citty';

import { addEnv, listEnvs, removeEnv } from '../lib/env.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { answer, isInteractive } from '../lib/prompt.ts';

const list = defineCommand({
  meta: { name: 'list', description: 'List the environments of this project' },
  args: { ...commonArgs },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const envs = await listEnvs(common.cwd);
      reporter.result({ ok: true, envs });
      if (!common.json) {
        for (const env of envs) reporter.info(`${env.name.padEnd(10)} ${env.displayName} (${env.scheme}://, suffix "${env.suffix}", badge ${env.badge ?? 'none'})`);
      }
    });
  },
});

const add = defineCommand({
  meta: { name: 'add', description: 'Add an environment (Gradle flavor, iOS configs, scripts, .env file, icons)' },
  args: {
    ...commonArgs,
    name: { type: 'positional', description: 'Env name, lowercase (e.g. qa)', required: true },
    'display-name': { type: 'string', description: 'App name shown on the device' },
    suffix: { type: 'string', description: 'Bundle id suffix, e.g. .qa' },
    scheme: { type: 'string', description: 'URL scheme' },
    badge: { type: 'string', description: 'Icon badge label (max 4 letters)' },
    'skip-native': { type: 'boolean', description: 'Do not run ios-envs.rb and the icon generator' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const env = await addEnv(
        common.cwd,
        { name: args.name, displayName: args['display-name'], suffix: args.suffix, scheme: args.scheme, badge: args.badge },
        { json: common.json, skipNative: args['skip-native'], warn: (message) => reporter.warn(message) },
      );
      reporter.success(`Added env "${env.name}". Fill in .env.${env.name}, then run: yarn pods`);
      reporter.result({ ok: true, env });
    });
  },
});

const remove = defineCommand({
  meta: { name: 'remove', description: 'Remove an environment everywhere it was added' },
  args: {
    ...commonArgs,
    name: { type: 'positional', description: 'Env name', required: true },
    'skip-native': { type: 'boolean', description: 'Do not touch the iOS project' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      if (isInteractive(common.yes)) {
        const ok = answer(await confirm({ message: `Remove env "${args.name}" and its files?`, initialValue: false }));
        if (!ok) return;
      }
      const env = await removeEnv(common.cwd, args.name, { json: common.json, skipNative: args['skip-native'], warn: (message) => reporter.warn(message) });
      reporter.success(`Removed env "${env.name}". Run: yarn pods`);
      reporter.result({ ok: true, env });
    });
  },
});

export default defineCommand({
  meta: { name: 'env', description: 'Manage environments' },
  subCommands: { list, add, remove },
});
