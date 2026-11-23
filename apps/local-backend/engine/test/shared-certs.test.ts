import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { certNames, createCerts, DEFAULT_NAMES, MKCERT_HINT, mkcertArgs, type RunResult, type Runner } from '../src/shared/certs.ts';

const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });

/** A runner that records calls instead of running anything. */
function fakeRunner(caRoot: string, overrides: Partial<Record<string, RunResult>> = {}): { run: Runner; calls: string[][] } {
  const calls: string[][] = [];
  const run: Runner = (command, args) => {
    calls.push([command, ...args]);
    const keyAt = args.indexOf('-key-file');
    if (keyAt !== -1) writeFileSync(args[keyAt + 1] ?? '', 'FAKE KEY'); // what mkcert would write
    return overrides[command] ?? (args[0] === '-CAROOT' ? ok(`${caRoot}\n`) : ok());
  };
  return { run, calls };
}

describe('certs (injected runner)', () => {
  let work: string;
  let caRoot: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'tempo-certs-'));
    caRoot = join(work, 'ca');
    mkdirSync(caRoot);
    writeFileSync(join(caRoot, 'rootCA.pem'), 'PUBLIC CA');
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('builds the mkcert arguments for the default names and the LAN address', () => {
    const out = join(work, 'out');
    const { run, calls } = fakeRunner(caRoot);
    createCerts({ outDir: out, extraHosts: ['my.test'], install: false, lan: '192.168.1.20' }, run, () => undefined);
    expect(calls[0]).toEqual(['mkcert', '-CAROOT']);
    expect(calls[1]).toEqual(['mkcert', ...mkcertArgs(out, [...DEFAULT_NAMES, '192.168.1.20', 'my.test'])]);
    expect(calls[1]).toContain(join(out, 'cert.pem'));
    expect(calls[1]).toContain(join(out, 'key.pem'));
    for (const name of ['localhost', '127.0.0.1', '::1', '10.0.2.2', 'dev-api.tempo.test', 'api.tempo.test', 'portal.tempo.test']) {
      expect(calls[1]).toContain(name);
    }
    expect(readFileSync(join(out, 'rootCA.pem'), 'utf8')).toBe('PUBLIC CA');
  });

  it('never installs into a trust store unless asked', () => {
    const quiet = fakeRunner(caRoot);
    createCerts({ outDir: join(work, 'a'), extraHosts: [], install: false, lan: undefined }, quiet.run, () => undefined);
    expect(quiet.calls.some((call) => call.includes('-install'))).toBe(false);

    const asked = fakeRunner(caRoot);
    createCerts({ outDir: join(work, 'b'), extraHosts: [], install: true, lan: undefined }, asked.run, () => undefined);
    expect(asked.calls.filter((call) => call.includes('-install'))).toEqual([['mkcert', '-install']]);
  });

  it('fails with the install hint when mkcert is missing', () => {
    const missing: Runner = () => ({ status: null, stdout: '', stderr: '', error: new Error('spawn mkcert ENOENT') });
    expect(() => createCerts({ outDir: work, extraHosts: [], install: false, lan: undefined }, missing, () => undefined)).toThrow(MKCERT_HINT);
    expect(MKCERT_HINT).toContain('brew install mkcert');
  });

  it('lists each name once', () => {
    expect(certNames(['localhost', 'z.test'], '10.0.0.5').filter((n) => n === 'localhost')).toHaveLength(1);
  });
});
