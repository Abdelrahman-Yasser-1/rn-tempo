import { confirm } from '@clack/prompts';
import type { FeatureName } from '@rn-tempo/contracts';
import { FEATURE_NAMES } from '@rn-tempo/contracts';
import { defineCommand } from 'citty';

import { addFeature, type AddFeatureResult } from '../lib/add-feature.ts';
import { CliError } from '../lib/errors.ts';
import { loadManifests, planRemoval } from '../lib/manifest.ts';
import { commonArgs, resolveCommon, runGuarded, type Reporter } from '../lib/output.ts';
import { installPods, yarnRun } from '../lib/pm.ts';
import { answer, isInteractive } from '../lib/prompt.ts';
import { removeFeatures } from '../lib/remove-feature.ts';
import { readTempoJson, writeTempoJson } from '../lib/tempo-json.ts';

function asFeature(name: string): FeatureName {
  if (!(FEATURE_NAMES as readonly string[]).includes(name)) {
    throw new CliError(`Unknown feature "${name}". Known: ${FEATURE_NAMES.join(', ')}`, { code: 'UNKNOWN_FEATURE' });
  }
  return name as FeatureName;
}

const list = defineCommand({
  meta: { name: 'list', description: 'List modules and whether they are enabled' },
  args: { ...commonArgs },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const tempo = await readTempoJson(common.cwd);
      const manifests = await loadManifests(common.cwd);
      const rows = [...manifests.values()].map((manifest) => ({ name: manifest.name, title: manifest.title, enabled: tempo.features.includes(manifest.name) }));
      reporter.result({ ok: true, features: rows });
      if (!common.json) for (const row of rows) reporter.info(`${row.enabled ? '[x]' : '[ ]'} ${row.name.padEnd(18)} ${row.title}`);
    });
  },
});

const remove = defineCommand({
  meta: { name: 'remove', description: 'Remove one or more modules from this project' },
  args: {
    ...commonArgs,
    names: { type: 'positional', description: 'Module name (repeat via comma: a,b)', required: true },
    'skip-post': { type: 'boolean', description: 'Do not run pod install / assets sync afterwards' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const requested = args.names.split(',').map((name) => asFeature(name.trim()));
      const tempo = await readTempoJson(common.cwd);
      const manifests = await loadManifests(common.cwd);
      const plan = planRemoval(manifests, tempo.features, requested);
      if (plan.remove.length === 0) {
        reporter.info('Nothing to remove: those modules are not enabled');
        reporter.result({ ok: true, removed: [] });
        return;
      }
      if (isInteractive(common.yes)) {
        const ok = answer(await confirm({ message: `Remove ${plan.remove.join(', ')}? This deletes files.`, initialValue: false }));
        if (!ok) return;
      }
      const result = await removeFeatures(common.cwd, manifests, plan.remove, plan.keep);
      await writeTempoJson(common.cwd, {
        ...tempo,
        features: plan.keep,
        ai: { ...tempo.ai, tools: tempo.ai.tools.filter((tool) => plan.keep.includes(`ai-${tool}` as FeatureName)) },
      });
      if (!args['skip-post']) {
        if (result.postRemove.includes('pods')) await installPods(common.cwd, { json: common.json });
        if (result.postRemove.includes('assets-sync')) await yarnRun(common.cwd, 'assets', [], { json: common.json });
      }
      reporter.success(`Removed ${plan.remove.join(', ')}. Run yarn install to refresh the lockfile.`);
      reporter.result({ ok: true, removed: plan.remove, ...result });
    });
  },
});

const add = defineCommand({
  meta: { name: 'add', description: 'Add a module back: restores its files, marked code, dependencies and env keys' },
  args: {
    ...commonArgs,
    name: { type: 'positional', description: 'Module name', required: true },
    template: { type: 'string', description: 'Local template folder or giget source (default: the tag of .tempo.json templateVersion)' },
    force: { type: 'boolean', description: 'Overwrite module files that already exist' },
    'dry-run': { type: 'boolean', description: 'Print what would change without writing' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const name = asFeature(args.name);
      const dryRun = Boolean(args['dry-run']);
      const result = await addFeature({
        projectDir: common.cwd,
        cwd: process.cwd(),
        feature: name,
        template: args.template,
        force: Boolean(args.force),
        dryRun,
      });
      if (!common.json) printAddResult(reporter, result);
      reporter.result({
        ok: true,
        feature: result.feature,
        added: result.added,
        updated: result.updated,
        conflicts: result.conflicts,
        followUps: result.followUps,
      });
    });
  },
});

function printAddResult(reporter: Reporter, result: AddFeatureResult): void {
  const verb = result.dryRun ? 'Would add' : 'Added';
  reporter.success(`${verb} ${result.features.join(', ')}${result.dryRun ? ' (dry run, nothing written)' : ''}`);
  for (const file of result.added) reporter.info(`  + ${file}`);
  for (const file of result.updated) reporter.info(`  ~ ${file}`);
  for (const conflict of result.conflicts) {
    reporter.warn(`${conflict.file}: ${conflict.reason}`);
    if (conflict.region !== undefined) reporter.info(`Merge this by hand:\n${conflict.region}`);
  }
  for (const followUp of result.followUps) reporter.info(`Next: ${followUp}`);
}

export default defineCommand({
  meta: { name: 'feature', description: 'Manage optional modules' },
  subCommands: { list, remove, add },
});
