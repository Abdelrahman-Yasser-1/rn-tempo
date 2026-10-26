import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CliError } from './errors.ts';
import { pathExists } from './fs-utils.ts';
import { buildVars, renderTemplateDir, toKebab, toPascal, type TemplateVars } from './generate.ts';
import { registerRoute, type RegisterResult } from './register.ts';
import { readTempoJson } from './tempo-json.ts';

export type ScaffoldOptions = {
  projectDir: string;
  force?: boolean;
  dryRun?: boolean;
  builtInRoot?: string;
  /** Add the route to `navigation/types.ts` and the stack navigator. */
  register?: boolean;
  /** Stack for screens, e.g. `Home` (default). */
  stack?: string;
  date?: Date;
};

export type ScaffoldResult = {
  created: string[];
  updated: string[];
  followUps: string[];
  register?: RegisterResult;
};

async function storybookEnabled(projectDir: string): Promise<boolean> {
  try {
    return (await readTempoJson(projectDir)).features.includes('storybook');
  } catch {
    return true; // not a tempo project: keep every file
  }
}

async function requireFeature(projectDir: string, feature: string): Promise<void> {
  if (!(await pathExists(path.join(projectDir, 'src/features', toKebab(feature))))) {
    throw new CliError(`Feature "${toKebab(feature)}" does not exist. Create it first: tempo g feature ${toKebab(feature)}`, {
      code: 'FEATURE_NOT_FOUND',
    });
  }
}

async function appendLine(file: string, line: string): Promise<boolean> {
  const text = (await pathExists(file)) ? await readFile(file, 'utf8') : '';
  if (text.includes(line)) return false;
  const cleaned = text.replace(/^export \{\};\n?/m, '');
  await writeFile(file, `${cleaned}${cleaned === '' || cleaned.endsWith('\n') ? '' : '\n'}${line}\n`);
  return true;
}

type Json = Record<string, unknown>;

/** Sets `value` at a dotted path in a locale file, keeping existing keys. Returns true when it changed. */
async function mergeLocaleKey(file: string, keyPath: readonly string[], value: string): Promise<boolean> {
  const data: Json = (await pathExists(file)) ? (JSON.parse(await readFile(file, 'utf8')) as Json) : {};
  let cursor = data;
  for (const key of keyPath.slice(0, -1)) {
    const next = cursor[key];
    if (typeof next !== 'object' || next === null) cursor[key] = {};
    cursor = cursor[key] as Json;
  }
  const last = keyPath.at(-1) ?? '';
  if (last in cursor) return false;
  cursor[last] = value;
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}

async function addScreenLocale(projectDir: string, vars: TemplateVars, dryRun: boolean): Promise<string[]> {
  const updated: string[] = [];
  for (const lang of ['en', 'ar']) {
    const rel = `src/locales/${lang}/${vars.feature}.json`;
    if (dryRun) {
      updated.push(rel);
    } else if (await mergeLocaleKey(path.join(projectDir, rel), ['screens', vars.name, 'title'], vars.Name)) {
      updated.push(rel);
    }
  }
  return updated;
}

/** `tempo g screen`: screen folder, locale keys, feature barrel export and (optionally) the route. */
export async function generateScreen(name: string, feature: string, options: ScaffoldOptions): Promise<ScaffoldResult> {
  await requireFeature(options.projectDir, feature);
  const vars = buildVars(name, feature, options.date);
  const rendered = await renderTemplateDir({ ...options, dirName: 'screen', vars });
  const updated: string[] = [];
  const followUps: string[] = [];
  let register: RegisterResult | undefined;
  if (!options.dryRun) {
    const barrel = path.join(options.projectDir, 'src/features', vars.feature, 'index.ts');
    if (await appendLine(barrel, `export { ${vars.Name}Screen } from './screens/${vars.Name}Screen';`)) {
      updated.push(`src/features/${vars.feature}/index.ts`);
    }
    updated.push(...(await addScreenLocale(options.projectDir, vars, false)));
    register = await registerRoute({
      projectDir: options.projectDir,
      stack: options.stack ?? 'Home',
      routeName: vars.Name,
      component: `${vars.Name}Screen`,
      importFrom: `@features/${vars.feature}`,
      navigator: options.register === true,
    });
    updated.push(...register.updated);
    followUps.push(...register.notes);
  }
  return { created: rendered.created, updated, followUps, register };
}

/** `tempo g feature`: the C5 feature tree, locales, specs and a first screen. */
export async function generateFeature(feature: string, options: ScaffoldOptions): Promise<ScaffoldResult> {
  const vars = buildVars(feature, feature, options.date);
  if ((await pathExists(path.join(options.projectDir, 'src/features', vars.feature))) && !options.force) {
    throw new CliError(`Feature "${vars.feature}" already exists (use --force to overwrite files)`, { code: 'FILE_EXISTS' });
  }
  const base = await renderTemplateDir({ ...options, dirName: 'feature', vars });
  const screen = await generateScreen(feature, feature, { ...options, force: true });
  const scope = vars.feature;
  const followUps = [
    ...screen.followUps,
    `Add "${scope}" to extraScopes in commitlint.config.mjs so commits can use the ${scope} scope`,
    `Register the "${scope}" i18n namespace where resources are declared (src/services/i18n)`,
    `Fill in specs/${scope}/spec.md and set status: approved before implementing`,
    'Run yarn verify',
  ];
  return { created: [...base.created, ...screen.created], updated: screen.updated, followUps, register: screen.register };
}

/** `tempo g component`: feature component, or shared component (+ story when storybook is enabled). */
export async function generateComponent(name: string, feature: string | undefined, options: ScaffoldOptions): Promise<ScaffoldResult> {
  if (feature !== undefined) await requireFeature(options.projectDir, feature);
  const vars = buildVars(name, feature ?? 'shared', options.date);
  const withStories = await storybookEnabled(options.projectDir);
  const rendered = await renderTemplateDir({
    ...options,
    dirName: feature === undefined ? 'component-shared' : 'component',
    vars,
    skip: (rel) => !withStories && rel.endsWith('.stories.tsx'),
  });
  const updated: string[] = [];
  if (feature === undefined && !options.dryRun) {
    const barrel = path.join(options.projectDir, 'src/shared/components/index.ts');
    if (await appendLine(barrel, `export { ${vars.Name} } from './${vars.Name}';`)) updated.push('src/shared/components/index.ts');
  }
  return { created: rendered.created, updated, followUps: [] };
}

/** `tempo g hook`: `use<Name>` in a feature or in shared hooks. */
export async function generateHook(name: string, feature: string | undefined, options: ScaffoldOptions): Promise<ScaffoldResult> {
  if (feature !== undefined) await requireFeature(options.projectDir, feature);
  const bare = name.replace(/^use(?=[A-Z-_ ])/, '');
  const vars = buildVars(bare, feature ?? 'shared', options.date);
  const rendered = await renderTemplateDir({ ...options, dirName: feature === undefined ? 'hook-shared' : 'hook', vars });
  const updated: string[] = [];
  if (feature === undefined && !options.dryRun) {
    const barrel = path.join(options.projectDir, 'src/shared/hooks/index.ts');
    if (await appendLine(barrel, `export { use${vars.Name} } from './use${vars.Name}';`)) updated.push('src/shared/hooks/index.ts');
  }
  return { created: rendered.created, updated, followUps: [] };
}

/** `tempo g store`: Zustand store + test inside a feature. */
export async function generateStore(name: string, feature: string, options: ScaffoldOptions): Promise<ScaffoldResult> {
  await requireFeature(options.projectDir, feature);
  const vars = buildVars(name, feature, options.date);
  const rendered = await renderTemplateDir({ ...options, dirName: 'store', vars });
  return { created: rendered.created, updated: [], followUps: [] };
}

/** `tempo g query`: TanStack Query hook inside a feature's api folder. */
export async function generateQuery(name: string, feature: string, options: ScaffoldOptions): Promise<ScaffoldResult> {
  await requireFeature(options.projectDir, feature);
  const vars = buildVars(name, feature, options.date);
  const rendered = await renderTemplateDir({ ...options, dirName: 'query', vars });
  return { created: rendered.created, updated: [], followUps: [`Move the query key into src/features/${vars.feature}/api/keys.ts if other code invalidates it`] };
}

/** Pascal name of a stack, e.g. `home` becomes `Home`. */
export function stackName(stack: string): string {
  return toPascal(stack);
}
