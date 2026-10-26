import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { FeatureName, TempoEnv, TempoJson } from '@rn-tempo/contracts';

import { addEnv, completeEnv, removeEnv, type EnvInput } from './env.ts';
import { CliError } from './errors.ts';
import { fetchTemplate } from './fetch-template.ts';
import { pathExists } from './fs-utils.ts';
import { runIcons } from './icons.ts';
import { loadManifests, planRemoval, resolveSelection, type ManifestMap } from './manifest.ts';
import { gitInit, gitInitialCommit, installPods, yarnInstall, type Runner } from './pm.ts';
import { removeFeatures, type PostRemoveStep } from './remove-feature.ts';
import { isValidAppName, isValidBundleId, kebabCase, renameProject, type AppIdentity } from './rename.ts';
import { readTempoJson, writeTempoJson } from './tempo-json.ts';
import { rewriteWorkspaceLinks } from './workspace-links.ts';

export const BUILT_IN_ENVS = ['dev', 'staging', 'prod'] as const;

const AI_FEATURE_TOOLS = { 'ai-claude': 'claude', 'ai-cursor': 'cursor', 'ai-copilot': 'copilot' } as const;

export type CreateOptions = {
  /** Directory to create (absolute). */
  dir: string;
  /** Used to resolve a relative `template` path. */
  cwd: string;
  name: string;
  displayName: string;
  bundleId: string;
  /** Envs to keep or add; the built-ins that are missing here are removed. */
  envs: readonly EnvInput[];
  /** Explicit list, or a resolver that receives the template's manifests (used by the prompts). */
  features: readonly FeatureName[] | ((manifests: ManifestMap) => Promise<readonly FeatureName[]>);
  logPrompts?: TempoJson['ai']['logPrompts'];
  template?: string;
  cliVersion: string;
  git: boolean;
  install: boolean;
  json?: boolean;
  runner?: Runner;
  /** Called after each pipeline step with a short label. */
  onStep?: (label: string) => void;
  onWarn?: (message: string) => void;
};

export type CreateResult = {
  dir: string;
  app: TempoJson['app'];
  envs: TempoEnv[];
  features: FeatureName[];
  templateSource: string;
  autoAdded: FeatureName[];
  steps: string[];
  postRemove: PostRemoveStep[];
};

/** Default env display names and schemes for the built-in envs, derived from the app identity. */
export function defaultEnvIdentity(name: string, app: { name: string; displayName: string }): { displayName: string; scheme: string } {
  const full = completeEnv(
    { name, displayName: name === 'staging' ? `${app.displayName} Stg` : undefined },
    { name: app.name, displayName: app.displayName, bundleId: 'x.y' },
  );
  return { displayName: full.displayName, scheme: full.scheme };
}

function identityOf(tempo: TempoJson): AppIdentity {
  return {
    name: tempo.app.name,
    displayName: tempo.app.displayName,
    bundleId: tempo.app.bundleId,
    envs: Object.fromEntries(tempo.envs.map((env) => [env.name, { displayName: env.displayName, scheme: env.scheme }])),
  };
}

/** Checks the inputs the prompts would validate, so `--yes` and flags fail the same way. */
export function validateCreateInput(input: { name: string; bundleId: string; envs: readonly EnvInput[] }): void {
  if (!isValidAppName(input.name)) {
    throw new CliError(`Invalid app name "${input.name}": use PascalCase letters and digits, e.g. MyApp`, { code: 'INVALID_NAME' });
  }
  if (!isValidBundleId(input.bundleId)) {
    throw new CliError(`Invalid bundle id "${input.bundleId}": use reverse-DNS in lowercase, e.g. com.example.myapp`, {
      code: 'INVALID_BUNDLE_ID',
    });
  }
  if (input.envs.length === 0) throw new CliError('Select at least one env', { code: 'INVALID_ENV' });
  const seen = new Set<string>();
  for (const env of input.envs) {
    if (seen.has(env.name)) throw new CliError(`Env "${env.name}" is listed twice`, { code: 'INVALID_ENV' });
    seen.add(env.name);
  }
}

/** Maps selected features to the `.tempo.json` ai block. */
export function aiToolsFor(features: readonly FeatureName[]): TempoJson['ai']['tools'] {
  return features.flatMap((feature) => (feature in AI_FEATURE_TOOLS ? [AI_FEATURE_TOOLS[feature as keyof typeof AI_FEATURE_TOOLS]] : []));
}

async function assertTargetFree(dir: string): Promise<void> {
  if (!(await pathExists(dir))) return;
  const entries = await readdir(dir);
  if (entries.length > 0) throw new CliError(`Directory ${dir} already exists and is not empty`, { code: 'TARGET_EXISTS' });
}

/**
 * The create pipeline: fetch, rename, remove unselected features, configure envs, write
 * `.tempo.json`, rewrite workspace links, then git / install / pods.
 */
export async function createProject(options: CreateOptions): Promise<CreateResult> {
  validateCreateInput(options);
  await assertTargetFree(options.dir);
  const steps: string[] = [];
  const step = (label: string) => {
    steps.push(label);
    options.onStep?.(label);
  };
  const runnerOptions = { json: options.json, runner: options.runner };

  // 1. fetch
  await mkdir(path.dirname(options.dir), { recursive: true });
  const fetched = await fetchTemplate({ template: options.template, cliVersion: options.cliVersion, dest: options.dir, cwd: options.cwd });
  step('fetch');

  // 2. rename (also rewrites the built-in env display names and schemes)
  const original = await readTempoJson(options.dir);
  const app = { name: options.name, displayName: options.displayName, bundleId: options.bundleId };
  const builtIns = original.envs.map((env) => {
    const chosen = options.envs.find((candidate) => candidate.name === env.name);
    const derived = defaultEnvIdentity(env.name, app);
    return { ...env, displayName: chosen?.displayName ?? derived.displayName, scheme: chosen?.scheme ?? derived.scheme };
  });
  const renamed: TempoJson = { ...original, app, envs: builtIns };
  await renameProject(options.dir, identityOf(original), identityOf(renamed));
  await writeTempoJson(options.dir, renamed);
  step('rename');

  // 3. features
  const manifests = await loadManifests(options.dir);
  const wanted = typeof options.features === 'function' ? await options.features(manifests) : options.features;
  const { features, added } = resolveSelection(manifests, wanted);
  const plan = planRemoval(
    manifests,
    original.features,
    original.features.filter((name) => !features.includes(name)),
  );
  const removal = await removeFeatures(options.dir, manifests, plan.remove, plan.keep);
  step('features');

  // 4. envs (only the difference to the template's dev/staging/prod)
  const envOptions = { ...runnerOptions, skipIcons: true, warn: options.onWarn };
  let envsChanged = false;
  for (const env of original.envs) {
    if (!options.envs.some((candidate) => candidate.name === env.name)) {
      await removeEnv(options.dir, env.name, envOptions);
      envsChanged = true;
    }
  }
  for (const env of options.envs) {
    if (!original.envs.some((candidate) => candidate.name === env.name)) {
      await addEnv(options.dir, env, envOptions);
      envsChanged = true;
    }
  }
  if (envsChanged) await runIcons(options.dir, runnerOptions);
  step('envs');

  // 5. .tempo.json and workspace links
  const current = await readTempoJson(options.dir);
  const finalJson: TempoJson = {
    ...current,
    createdWith: `create-tempo-app@${options.cliVersion}`,
    features,
    ai: { tools: aiToolsFor(features), logPrompts: options.logPrompts ?? 'full' },
  };
  await writeTempoJson(options.dir, finalJson);
  await rewriteWorkspaceLinks(options.dir);
  step('metadata');

  // 6. git, install, pods
  if (options.git) {
    await gitInit(options.dir, runnerOptions);
    step('git init');
  }
  if (options.install) {
    await yarnInstall(options.dir, runnerOptions);
    step('install');
    if (await installPods(options.dir, runnerOptions)) step('pods');
  }
  if (options.git) {
    await gitInitialCommit(options.dir, `chore(repo): initialize from rn-tempo v${options.cliVersion}`, runnerOptions);
    step('git commit');
  }

  return {
    dir: options.dir,
    app,
    envs: finalJson.envs,
    features,
    templateSource: fetched.source,
    autoAdded: added,
    steps,
    postRemove: removal.postRemove,
  };
}

/** Default bundle id for `--yes`: `com.example.<lowercase app name>`. */
export function defaultBundleId(name: string): string {
  return `com.example.${name.toLowerCase()}`;
}

/** Default display name for `--yes`: the PascalCase name split into words. */
export function defaultDisplayName(name: string): string {
  return kebabCase(name)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
