import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CliError } from '../src/lib/errors.ts';
import { buildVars, render, renderTemplateDir, toCamel, toKebab, toPascal, toUpperSnake } from '../src/lib/generate.ts';
import { makeTempDir } from './helpers.ts';

const FIXED_DATE = new Date('2026-03-04T12:00:00Z');

describe('name helpers', () => {
  it('convert kebab, camel and Pascal input to every casing', () => {
    for (const input of ['wallet-card', 'walletCard', 'WalletCard', 'wallet_card', 'wallet card']) {
      expect(toPascal(input)).toBe('WalletCard');
      expect(toCamel(input)).toBe('walletCard');
      expect(toKebab(input)).toBe('wallet-card');
      expect(toUpperSnake(input)).toBe('WALLET_CARD');
    }
  });

  it('keeps acronyms readable', () => {
    expect(toKebab('HTTPClient')).toBe('http-client');
    expect(toPascal('my API client')).toBe('MyApiClient');
  });

  it('buildVars derives every placeholder from the name and feature', () => {
    expect(buildVars('wallet-card', 'wallet', FIXED_DATE)).toEqual({
      name: 'walletCard',
      Name: 'WalletCard',
      name_kebab: 'wallet-card',
      NAME_UPPER: 'WALLET_CARD',
      feature: 'wallet',
      featureCamel: 'wallet',
      FeatureName: 'Wallet',
      FEATURE_UPPER: 'WALLET',
      date: '2026-03-04',
    });
  });

  it('buildVars rejects names that cannot become identifiers or folders', () => {
    for (const bad of ['1card', 'card!', 'my--card', '-card']) {
      expect(() => buildVars(bad, 'wallet', FIXED_DATE)).toThrow(/Invalid name/);
    }
    expect(() => buildVars('card', 'bad feature!', FIXED_DATE)).toThrow(/Invalid feature name/);
    expect(() => buildVars('card', 'wallet', FIXED_DATE)).not.toThrow();
  });
});

describe('render', () => {
  const vars = buildVars('wallet-card', 'wallet', FIXED_DATE);

  it('replaces every {{key}} placeholder and leaves other braces alone', () => {
    expect(render('{{Name}} in {{feature}} ({{name_kebab}}) {single} {{ spaced }}', vars)).toBe(
      'WalletCard in wallet (wallet-card) {single} {{ spaced }}',
    );
  });

  it('throws on an unknown placeholder instead of leaving it in the output', () => {
    expect(() => render('hello {{missing}}', vars)).toThrow(CliError);
    expect(() => render('hello {{missing}}', vars)).toThrow(/Unknown template placeholder \{\{missing\}\}/);
  });
});

describe('renderTemplateDir', () => {
  let root = '';
  let project = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-templates'));
    project = path.join(root, 'project');
    await mkdir(project);
    const template = path.join(root, 'templates/demo');
    await mkdir(path.join(template, 'src/{{feature}}/{{Name}}Panel'), { recursive: true });
    await writeFile(path.join(template, 'src/{{feature}}/{{Name}}Panel/{{Name}}Panel.tsx.tmpl'), 'export const {{name}} = "{{NAME_UPPER}}";\n');
    await writeFile(path.join(template, 'src/{{feature}}/index.ts'), "export { {{name}} } from './{{Name}}Panel/{{Name}}Panel';\n");
  });
  afterEach(async () => cleanup());

  it('renders placeholders in file names and contents and strips .tmpl', async () => {
    const vars = buildVars('card', 'wallet', FIXED_DATE);
    const result = await renderTemplateDir({ projectDir: project, dirName: 'demo', vars, builtInRoot: path.join(root, 'templates') });

    expect(result.created).toEqual(['src/wallet/CardPanel/CardPanel.tsx', 'src/wallet/index.ts']);
    expect(result.templateSource).toBe('built-in');
    expect(await readFile(path.join(project, 'src/wallet/CardPanel/CardPanel.tsx'), 'utf8')).toBe('export const card = "CARD";\n');
    expect(await readFile(path.join(project, 'src/wallet/index.ts'), 'utf8')).toBe("export { card } from './CardPanel/CardPanel';\n");
  });

  it('refuses to overwrite existing files, writes nothing, and lists the conflicts', async () => {
    const vars = buildVars('card', 'wallet', FIXED_DATE);
    await mkdir(path.join(project, 'src/wallet'), { recursive: true });
    await writeFile(path.join(project, 'src/wallet/index.ts'), 'original\n');
    const options = { projectDir: project, dirName: 'demo', vars, builtInRoot: path.join(root, 'templates') };

    const error = await renderTemplateDir(options).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('FILE_EXISTS');
    expect((error as CliError).details).toEqual(['src/wallet/index.ts']);
    expect(await readFile(path.join(project, 'src/wallet/index.ts'), 'utf8')).toBe('original\n');
    await expect(readFile(path.join(project, 'src/wallet/CardPanel/CardPanel.tsx'), 'utf8')).rejects.toThrow();

    await renderTemplateDir({ ...options, force: true });
    expect(await readFile(path.join(project, 'src/wallet/index.ts'), 'utf8')).toContain('CardPanel');
  });

  it('prefers a project-level template override in .tempo/templates', async () => {
    const vars = buildVars('card', 'wallet', FIXED_DATE);
    const override = path.join(project, '.tempo/templates/demo/src/{{feature}}');
    await mkdir(override, { recursive: true });
    await writeFile(path.join(override, 'OVERRIDE-{{Name}}.ts'), 'override\n');

    const result = await renderTemplateDir({ projectDir: project, dirName: 'demo', vars, builtInRoot: path.join(root, 'templates') });

    expect(result.templateSource).toBe('project');
    expect(result.created).toEqual(['src/wallet/OVERRIDE-Card.ts']);
  });
});
