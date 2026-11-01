import { defineCommand } from 'citty';

import { CliError } from '../lib/errors.ts';
import { commonArgs, resolveCommon, runGuarded, type Reporter } from '../lib/output.ts';
import {
  generateComponent,
  generateFeature,
  generateHook,
  generateQuery,
  generateScreen,
  generateStore,
  stackName,
  type ScaffoldOptions,
  type ScaffoldResult,
} from '../lib/scaffold.ts';

const writeArgs = {
  ...commonArgs,
  force: { type: 'boolean', description: 'Overwrite files that already exist' },
  'dry-run': { type: 'boolean', description: 'Print what would be created without writing' },
} as const;

type WriteArgs = { force?: boolean; 'dry-run'?: boolean; register?: boolean; stack?: string };

function requireFeature(feature: string | undefined, kind: string): string {
  if (feature === undefined || feature === '') {
    throw new CliError(`"tempo g ${kind}" needs --feature <name>`, { code: 'MISSING_FEATURE' });
  }
  return feature;
}

function optionsFor(cwd: string, args: WriteArgs): ScaffoldOptions {
  return {
    projectDir: cwd,
    force: args.force,
    dryRun: args['dry-run'],
    register: args.register,
    stack: args.stack === undefined ? undefined : stackName(args.stack),
  };
}

function report(reporter: Reporter, json: boolean, kind: string, dryRun: boolean, result: ScaffoldResult): void {
  reporter.result({ ok: true, kind, dryRun, ...result });
  if (json) return;
  const verb = dryRun ? 'Would create' : 'Created';
  reporter.success(`${verb} ${result.created.length} file(s):\n${result.created.map((file) => `  ${file}`).join('\n')}`);
  if (result.updated.length > 0) reporter.info(`${dryRun ? 'Would update' : 'Updated'}:\n${result.updated.map((file) => `  ${file}`).join('\n')}`);
  if (result.followUps.length > 0) reporter.info(`Next steps:\n${result.followUps.map((step) => `  - ${step}`).join('\n')}`);
}

type Run = (name: string, cwd: string, args: WriteArgs & { feature?: string }) => Promise<ScaffoldResult>;

function generator(kind: string, description: string, run: Run, extra: Record<string, unknown> = {}) {
  return defineCommand({
    meta: { name: kind, description },
    args: {
      ...writeArgs,
      name: { type: 'positional', description: 'Name (kebab-case, camelCase or PascalCase)', required: true },
      feature: { type: 'string', description: 'Feature the file belongs to' },
      ...extra,
    },
    async run({ args }) {
      const common = resolveCommon(args);
      await runGuarded(common.json, async (reporter) => {
        const result = await run(args.name, common.cwd, args as WriteArgs & { feature?: string });
        report(reporter, common.json, kind, Boolean(args['dry-run']), result);
      });
    },
  });
}

const registerArgs = {
  register: { type: 'boolean', description: 'Add the screen to the stack navigator as well as navigation/types.ts' },
  stack: { type: 'string', description: 'Stack the route belongs to, e.g. Home (default)' },
} as const;

const feature = generator(
  'feature',
  'Generate a feature folder with api, a first screen, locales and specs',
  (name, cwd, args) => generateFeature(name, optionsFor(cwd, args)),
  registerArgs,
);

const screen = generator(
  'screen',
  'Generate a screen inside a feature and add its route',
  (name, cwd, args) => generateScreen(name, requireFeature(args.feature, 'screen'), optionsFor(cwd, args)),
  registerArgs,
);

const component = generator('component', 'Generate a component (shared, or inside a feature with --feature)', (name, cwd, args) =>
  generateComponent(name, args.feature, optionsFor(cwd, args)),
);

const hook = generator('hook', 'Generate a hook (shared, or inside a feature with --feature)', (name, cwd, args) =>
  generateHook(name, args.feature, optionsFor(cwd, args)),
);

const store = generator('store', 'Generate a Zustand store inside a feature', (name, cwd, args) =>
  generateStore(name, requireFeature(args.feature, 'store'), optionsFor(cwd, args)),
);

const query = generator('query', 'Generate a TanStack Query hook inside a feature', (name, cwd, args) =>
  generateQuery(name, requireFeature(args.feature, 'query'), optionsFor(cwd, args)),
);

export default defineCommand({
  meta: { name: 'generate', description: 'Generate features, screens, components, hooks, stores and queries' },
  subCommands: { feature, screen, component, hook, store, query },
});
