import { defineCommand } from 'citty';

import { CliError } from '../lib/errors.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { isValidAppName, isValidBundleId, kebabCase, renameProject, type AppIdentity } from '../lib/rename.ts';
import { readTempoJson, writeTempoJson } from '../lib/tempo-json.ts';

export default defineCommand({
  meta: { name: 'rename', description: 'Rename the app identifier, display name and/or bundle id' },
  args: {
    ...commonArgs,
    name: { type: 'string', description: 'New app identifier (PascalCase)' },
    'display-name': { type: 'string', description: 'New display name' },
    'bundle-id': { type: 'string', description: 'New base bundle id' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const tempo = await readTempoJson(common.cwd);
      const app = {
        name: args.name ?? tempo.app.name,
        displayName: args['display-name'] ?? tempo.app.displayName,
        bundleId: args['bundle-id'] ?? tempo.app.bundleId,
      };
      if (app.name === tempo.app.name && app.displayName === tempo.app.displayName && app.bundleId === tempo.app.bundleId) {
        throw new CliError('Nothing to rename: pass --name, --display-name or --bundle-id', { code: 'NOTHING_TO_DO' });
      }
      if (!isValidAppName(app.name)) throw new CliError(`Invalid app name "${app.name}"`, { code: 'INVALID_NAME' });
      if (!isValidBundleId(app.bundleId)) throw new CliError(`Invalid bundle id "${app.bundleId}"`, { code: 'INVALID_BUNDLE_ID' });

      // Env display names and schemes follow the app when they were derived from it.
      const oldSlug = kebabCase(tempo.app.name);
      const newSlug = kebabCase(app.name);
      const envs = tempo.envs.map((env) => ({
        ...env,
        displayName: env.displayName.startsWith(tempo.app.displayName) ? `${app.displayName}${env.displayName.slice(tempo.app.displayName.length)}` : env.displayName,
        scheme: env.scheme.startsWith(oldSlug) ? `${newSlug}${env.scheme.slice(oldSlug.length)}` : env.scheme,
      }));
      const identity = (name: string, displayName: string, bundleId: string, list: typeof envs): AppIdentity => ({
        name,
        displayName,
        bundleId,
        envs: Object.fromEntries(list.map((env) => [env.name, { displayName: env.displayName, scheme: env.scheme }])),
      });
      const result = await renameProject(
        common.cwd,
        identity(tempo.app.name, tempo.app.displayName, tempo.app.bundleId, tempo.envs),
        identity(app.name, app.displayName, app.bundleId, envs),
      );
      await writeTempoJson(common.cwd, { ...tempo, app, envs });
      reporter.success(`Renamed ${result.rewrittenFiles.length} files and moved ${result.movedPaths.length} paths`);
      reporter.warn('Run `yarn pods` (and delete ios/Pods and ios/build first if they exist) to refresh the native projects');
      reporter.result({ ok: true, app, rewrittenFiles: result.rewrittenFiles, movedPaths: result.movedPaths });
    });
  },
});
