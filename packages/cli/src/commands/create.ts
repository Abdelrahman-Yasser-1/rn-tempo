import path from 'node:path';

import { confirm, intro, multiselect, note, outro, text } from '@clack/prompts';
import type { FeatureName } from '@rn-tempo/contracts';
import { defineCommand } from 'citty';

import { BUILT_IN_ENVS, createProject, defaultBundleId, defaultDisplayName, defaultEnvIdentity, validateCreateInput } from '../lib/create.ts';
import type { EnvInput } from '../lib/env.ts';
import { CliError } from '../lib/errors.ts';
import { defaultFeatures, type ManifestMap } from '../lib/manifest.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { answer, isInteractive, splitList } from '../lib/prompt.ts';
import { isValidAppName, isValidBundleId } from '../lib/rename.ts';
import { CLI_VERSION } from '../lib/version.ts';

const isAi = (name: FeatureName) => name.startsWith('ai-');

/** Asks for the module selection from the template's manifests (AI tools are a separate prompt). */
async function promptFeatures(manifests: ManifestMap): Promise<FeatureName[]> {
  const defaults = new Set(defaultFeatures(manifests));
  const options = (filter: (name: FeatureName) => boolean) =>
    [...manifests.values()]
      .filter((manifest) => filter(manifest.name))
      .map((manifest) => ({ value: manifest.name, label: manifest.title, hint: manifest.description }));
  const modules = answer(
    await multiselect<FeatureName>({
      message: 'Modules to include',
      options: options((name) => !isAi(name)),
      initialValues: [...defaults].filter((name) => !isAi(name)),
      required: false,
    }),
  );
  const tools = answer(
    await multiselect<FeatureName>({
      message: 'AI tools to set up',
      options: options(isAi),
      initialValues: [...defaults].filter(isAi),
      required: false,
    }),
  );
  return [...modules, ...tools];
}

export default defineCommand({
  meta: { name: 'create-tempo-app', version: CLI_VERSION, description: 'Create an RN-TEMPO app from the template' },
  args: {
    ...commonArgs,
    name: { type: 'positional', description: 'App name in PascalCase, e.g. MyApp', required: false },
    'display-name': { type: 'string', description: 'Name shown under the app icon' },
    'bundle-id': { type: 'string', description: 'Base bundle id (reverse-DNS, lowercase)' },
    envs: { type: 'string', description: 'Comma separated env names (default: dev,staging,prod)' },
    features: { type: 'string', description: 'Comma separated module names (replaces the defaults)' },
    without: { type: 'string', description: 'Comma separated module names to drop from the defaults' },
    template: { type: 'string', description: 'Local template folder or giget source (default: the tag of this CLI version)' },
    'skip-install': { type: 'boolean', description: 'Do not run yarn install / pod install' },
    'skip-git': { type: 'boolean', description: 'Do not run git init and the initial commit' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const interactive = isInteractive(common.yes) && !common.json;
      if (interactive) intro(`create-tempo-app v${CLI_VERSION}`);

      let name = args.name;
      if (!name && interactive) {
        name = answer(
          await text({
            message: 'App name (PascalCase)',
            placeholder: 'MyApp',
            validate: (value) => (value && isValidAppName(value) ? undefined : 'Use PascalCase letters and digits, e.g. MyApp'),
          }),
        );
      }
      if (!name) throw new CliError('Missing app name. Usage: create-tempo-app <Name> [--yes]', { code: 'MISSING_NAME' });
      if (!isValidAppName(name)) throw new CliError(`Invalid app name "${name}": use PascalCase letters and digits, e.g. MyApp`, { code: 'INVALID_NAME' });

      let displayName = args['display-name'] ?? defaultDisplayName(name);
      if (interactive && !args['display-name']) {
        displayName = answer(await text({ message: 'Display name', defaultValue: displayName, placeholder: displayName }));
      }
      let bundleId = args['bundle-id'] ?? defaultBundleId(name);
      if (interactive && !args['bundle-id']) {
        bundleId = answer(
          await text({
            message: 'Base bundle id',
            defaultValue: bundleId,
            placeholder: bundleId,
            validate: (value) => (!value || isValidBundleId(value) ? undefined : 'Use reverse-DNS in lowercase, e.g. com.example.app'),
          }),
        );
      }

      let envNames = args.envs ? splitList(args.envs) : [...BUILT_IN_ENVS];
      if (interactive && !args.envs) {
        const picked = answer(
          await multiselect<string>({
            message: 'Environments',
            options: BUILT_IN_ENVS.map((env) => ({ value: env })),
            initialValues: [...BUILT_IN_ENVS],
            required: true,
          }),
        );
        const custom = answer(await text({ message: 'Custom environments (comma separated, optional)', defaultValue: '', placeholder: 'qa,uat' }));
        envNames = [...picked, ...splitList(custom)];
      }
      const envs: EnvInput[] = [];
      for (const envName of envNames) {
        const input: EnvInput = { name: envName };
        if (interactive) {
          const suggested = defaultEnvIdentity(envName, { name, displayName }).displayName;
          input.displayName = answer(await text({ message: `Display name for ${envName}`, defaultValue: suggested, placeholder: suggested }));
          if (!(BUILT_IN_ENVS as readonly string[]).includes(envName)) {
            input.suffix = answer(await text({ message: `Bundle id suffix for ${envName}`, defaultValue: `.${envName}`, placeholder: `.${envName}` }));
          }
        }
        envs.push(input);
      }
      validateCreateInput({ name, bundleId, envs });

      let git = !args['skip-git'];
      let install = !args['skip-install'];
      if (interactive) {
        git = git && answer(await confirm({ message: 'Initialize a git repository?', initialValue: true }));
        install = install && answer(await confirm({ message: 'Install dependencies now?', initialValue: true }));
      }

      const withoutList = splitList(args.without);
      const features: Parameters<typeof createProject>[0]['features'] = args.features
        ? (splitList(args.features) as FeatureName[])
        : interactive
          ? promptFeatures
          : async (manifests) => defaultFeatures(manifests).filter((feature) => !withoutList.includes(feature));

      const dir = path.resolve(common.cwd, name);
      reporter.step(`Creating ${name} in ${dir}`);
      const result = await createProject({
        dir,
        cwd: common.cwd,
        name,
        displayName,
        bundleId,
        envs,
        features,
        template: args.template,
        cliVersion: CLI_VERSION,
        git,
        install,
        json: common.json,
        onStep: (label) => reporter.info(`done: ${label}`),
        onWarn: (message) => reporter.warn(message),
      });

      const next = [`cd ${name}`, ...(install ? [] : ['yarn install', 'yarn pods']), 'yarn ios:dev   # or yarn android:dev'];
      if (result.autoAdded.length > 0) reporter.warn(`Also enabled (required by other modules): ${result.autoAdded.join(', ')}`);
      reporter.result({ ok: true, ...result, nextSteps: next });
      if (!common.json) {
        note(next.join('\n'), 'Next steps');
        outro(`${name} is ready.`);
      }
    });
  },
});
