import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { defineCommand } from 'citty';

import { CliError } from '../lib/errors.ts';
import { pathExists, walkFiles } from '../lib/fs-utils.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { projectScript, runProjectScript } from '../lib/project-script.ts';

const newSpec = defineCommand({
  meta: { name: 'new', description: 'Create a spec folder from this project’s templates' },
  args: {
    ...commonArgs,
    name: { type: 'positional', required: true, description: 'Spec name in kebab-case' },
    'dry-run': { type: 'boolean', description: 'List the files that would be created' },
  },
  async run({ args }) {
    const { cwd, json } = resolveCommon(args);
    await runGuarded(json, async (reporter) => {
      const { name } = args;
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
        throw new CliError('Use a kebab-case spec name, for example wallet-history.', { code: 'INVALID_SPEC_NAME' });
      }
      const destination = path.join(cwd, 'specs', name);
      const exists = new CliError(`specs/${name} already exists.`, { code: 'SPEC_EXISTS' });
      if (await pathExists(destination)) throw exists;
      const templates = path.join(cwd, 'specs/_templates');
      if (!(await pathExists(templates))) {
        throw new CliError('Missing specs/_templates. This project may predate the spec templates.', { code: 'SPEC_TEMPLATES_MISSING' });
      }
      const files = await walkFiles(templates);
      const created = files.map((file) => `specs/${name}/${file}`);
      const dryRun = Boolean(args['dry-run']);
      if (!dryRun) {
        try {
          await mkdir(destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw exists;
          throw error;
        }
        try {
          for (const file of files) await cp(path.join(templates, file), path.join(destination, file));
        } catch (error) {
          await rm(destination, { recursive: true, force: true });
          throw error;
        }
      }
      reporter.info(`${dryRun ? 'Would create' : 'Created'} specs/${name}/\n${created.join('\n')}`);
      reporter.result({ ok: true, name, dryRun, created });
    });
  },
});

const check = defineCommand({
  meta: { name: 'check', description: 'Check acceptance criteria against project tests' },
  args: { ...commonArgs, strict: { type: 'boolean', description: 'Enforce coverage for every spec status' } },
  async run({ args }) {
    const { cwd, json } = resolveCommon(args);
    await runGuarded(json, async (reporter) => {
      const file = await projectScript(cwd, 'scripts/spec-check.mjs', 'SPEC_SCRIPT_MISSING');
      const flags = args.strict ? ['--strict'] : [];
      if (json) flags.push('--json');
      const { stdout, exitCode } = await runProjectScript(cwd, file, flags);
      if (json) {
        // A checker that crashes before producing its report still has a meaningful exit code.
        let report: unknown;
        try {
          report = JSON.parse(stdout);
        } catch (error) {
          if (stdout) reporter.error(stdout);
          if (exitCode === 0) throw error;
          report = { ok: false, exitCode };
        }
        reporter.result(report);
      } else if (stdout) {
        process.stdout.write(`${stdout}\n`);
      }
    });
  },
});

export default defineCommand({
  meta: { name: 'spec', description: 'Create project specs and check acceptance criteria coverage' },
  subCommands: { new: newSpec, check },
});
