import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startBackend, type RunningBackend, type StartOptions } from '../src/app.ts';
import type { BackendInput } from '../src/schema.ts';

export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'lb-test-'));

const running: RunningBackend[] = [];

/** Writes a backend.json into a fresh folder and serves it over HTTP on a free port. */
export async function serve(definition: BackendInput, options: StartOptions = {}): Promise<{ dir: string; backend: RunningBackend; url: string }> {
  const dir = tempDir();
  writeFileSync(join(dir, 'backend.json'), JSON.stringify(definition));
  const backend = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, ...options });
  running.push(backend);
  return { dir, backend, url: `http://127.0.0.1:${backend.port}` };
}

export async function stopAll(): Promise<void> {
  await Promise.all(running.splice(0).map((backend) => backend.stop()));
}

export async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}
