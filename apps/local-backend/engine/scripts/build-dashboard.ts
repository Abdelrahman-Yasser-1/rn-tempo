// Builds the web dashboard (the app's Vite build with `--mode web`) and copies it into the engine package as
// `dashboard/`, which the engine serves on its admin listener, `npm pack` ships, and the single executable embeds.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(engineDir, '../app');
const out = join(appDir, 'dist-web');
const target = join(engineDir, 'dashboard');

execFileSync('npx', ['vite', 'build', '--mode', 'web', '--outDir', 'dist-web'], { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'] });
if (!existsSync(join(out, 'index.html'))) throw new Error('The web build did not produce index.html.');
rmSync(target, { recursive: true, force: true });
cpSync(out, target, { recursive: true });
process.stdout.write(`${target}\n`);
