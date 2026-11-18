import { describe, expect, it } from 'vitest';
import type { Runner, RunResult } from '@rn-tempo/dev-api';

import { ANDROID_CA_PATH, trustAndroid, trustIos, trustMac } from '../src/trust.ts';

const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });

function recorder(answer: (command: string, args: string[]) => RunResult): { run: Runner; calls: { command: string; args: string[] }[] } {
  const calls: { command: string; args: string[] }[] = [];
  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args });
      return answer(command, args);
    },
  };
}
const mkcertRoot = (command: string, args: string[]): RunResult => (command === 'mkcert' && args[0] === '-CAROOT' ? ok('/ca\n') : ok());

describe('trust commands (injected runner, nothing real runs)', () => {
  it('trustMac runs mkcert -install and nothing else', () => {
    const { run, calls } = recorder(() => ok());
    const said: string[] = [];
    trustMac(run, (line) => said.push(line ?? ''));
    expect(calls).toEqual([{ command: 'mkcert', args: ['-install'] }]);
    expect(said.join(' ')).toMatch(/trusted on this Mac/);
  });

  it('trustMac explains a missing mkcert and a refusal', () => {
    expect(() => trustMac(() => ({ status: null, stdout: '', stderr: '', error: new Error('ENOENT') }), () => undefined)).toThrow(/mkcert is not installed/);
    expect(() => trustMac(() => ({ status: 1, stdout: '', stderr: 'denied', }), () => undefined)).toThrow(/denied/);
  });

  it('trustIos adds the CA to a simulator only', () => {
    const { run, calls } = recorder(mkcertRoot);
    trustIos(run, () => undefined, 'AB12-34CD');
    expect(calls[1]).toEqual({ command: 'xcrun', args: ['simctl', 'keychain', 'AB12-34CD', 'add-root-cert', '/ca/rootCA.pem'] });
  });

  it('trustIos refuses an id that could be a flag, before running anything', () => {
    const { run, calls } = recorder(mkcertRoot);
    for (const bad of ['--help', '-a', '--', 'a b', '', 'zz', 'booted; rm']) expect(() => trustIos(run, () => undefined, bad)).toThrow(/not a simulator id/);
    expect(calls).toEqual([]);
  });

  it('trustAndroid pushes the CA to Download with an optional serial', () => {
    const { run, calls } = recorder(mkcertRoot);
    trustAndroid(run, () => undefined, 'emulator-5554');
    expect(calls[1]).toEqual({ command: 'adb', args: ['-s', 'emulator-5554', 'push', '/ca/rootCA.pem', ANDROID_CA_PATH] });
    expect(() => trustAndroid(run, () => undefined, '--evil')).toThrow(/not a device serial/);
  });
});
