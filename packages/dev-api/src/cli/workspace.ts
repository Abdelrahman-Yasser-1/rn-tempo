import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

import { defineCommand } from 'citty';

import { exportCode, writeExport } from '../workspace/export.ts';
import { loadWorkspaceFile } from '../workspace/load.ts';
import { importOpenApi, parseOpenApiText } from '../workspace/openapi-import.ts';
import { resolvePaths, WORKSPACE_FILE } from './paths.ts';

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

function fail(message: string): never {
  process.stderr.write(`tempo-api: ${message}\n`);
  process.exit(1);
}

const at = (cwd: string, path: string): string => (isAbsolute(path) ? path : resolve(cwd, path));

const importOpenapi = defineCommand({
  meta: { name: 'openapi', description: 'Import an OpenAPI 3.0/3.1 file (JSON or YAML) as a tempo-api.json workspace' },
  args: {
    file: { type: 'positional', description: 'The OpenAPI file', required: true },
    out: { type: 'string', description: `Where to write the workspace (default ${WORKSPACE_FILE})`, default: WORKSPACE_FILE },
    cwd: { type: 'string', description: 'Project folder (default: the current folder)' },
    force: { type: 'boolean', description: 'Overwrite the output file when it exists' },
  },
  run({ args }) {
    const cwd = resolvePaths(args.cwd, undefined).cwd;
    // The input file is relative to where the command is typed, like any shell argument; `--out` to the project.
    const source = at(process.cwd(), args.file);
    const out = at(cwd, args.out);
    if (!existsSync(source)) return fail(`File not found: ${source}`);
    if (existsSync(out) && args.force !== true) return fail(`${out} already exists. Use --force to overwrite it.`);
    try {
      const { workspace, warnings } = importOpenApi(parseOpenApiText(readFileSync(source, 'utf8'), source), basename(source).replace(/\.[^.]+$/, ''));
      writeFileSync(out, `${JSON.stringify(workspace, null, 2)}\n`);
      say(`Imported ${workspace.endpoints.length} endpoints into ${relative(cwd, out) || out}.`);
      for (const warning of warnings) say(`  warning: ${warning}`);
      say(`Serve it with: tempo-api up --config ${relative(cwd, out) || out}`);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const importCommand = defineCommand({
  meta: { name: 'import', description: 'Import an API description into a workspace' },
  subCommands: { openapi: importOpenapi },
});

const exportConfig = defineCommand({
  meta: { name: 'code', description: 'Write a TypeScript config and endpoint files from a tempo-api.json workspace' },
  args: {
    config: { type: 'string', description: `The workspace file (default ${WORKSPACE_FILE} in the project folder)` },
    cwd: { type: 'string', description: 'Folder holding the workspace (default: the current folder)' },
    out: { type: 'string', description: 'Project folder to write api/ into (default: --cwd)' },
    force: { type: 'boolean', description: 'Overwrite files that already exist' },
  },
  run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    const workspaceFile = args.config === undefined ? resolve(paths.cwd, WORKSPACE_FILE) : paths.config;
    const outDir = args.out === undefined ? paths.cwd : at(paths.cwd, args.out);
    if (!existsSync(workspaceFile)) return fail(`Workspace not found: ${workspaceFile}. Pass --config <file>.`);
    try {
      const { files, warnings } = exportCode(loadWorkspaceFile(workspaceFile));
      const written = writeExport(outDir, files, args.force === true);
      for (const file of written) say(`  wrote ${relative(process.cwd(), file) || file}`);
      for (const warning of warnings) say(`  warning: ${warning}`);
      say('The project now has a code config. Run `tempo-api check` after `tempo-api generate`.');
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const exportCommand = defineCommand({
  meta: { name: 'export', description: 'Export a workspace' },
  subCommands: { code: exportConfig },
});
