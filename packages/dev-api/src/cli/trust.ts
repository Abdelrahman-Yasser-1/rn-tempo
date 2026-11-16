import { join } from 'node:path';

import { defineCommand } from 'citty';

import { caRoot, realRunner, type Runner } from './certs.ts';

/** Where the CA lands on an Android device; the user then installs it from Settings. */
export const ANDROID_CA_PATH = '/sdcard/Download/tempo-dev-ca.pem';

export function simctlArgs(caFile: string, device: string): string[] {
  return ['simctl', 'keychain', device, 'add-root-cert', caFile];
}

export function adbPushArgs(caFile: string, serial: string | undefined): string[] {
  return [...(serial === undefined ? [] : ['-s', serial]), 'push', caFile, ANDROID_CA_PATH];
}

export const ANDROID_STEPS = (caFile: string): string[] => [
  'Trust the local CA on Android (debug builds of the dev flavor only):',
  `  1. Copy the CA to the device: adb push ${caFile} ${ANDROID_CA_PATH}`,
  '     (or run `yarn api trust android --push`)',
  '  2. On the device or emulator open Settings, then Security (or "Security & privacy"),',
  '     then Encryption & credentials, then Install a certificate, then CA certificate.',
  '  3. Accept the warning and pick tempo-dev-ca.pem from Downloads.',
  'Emulator note: the host machine is reachable at https://10.0.2.2:<port>.',
];

const rootPem = (run: Runner): string => join(caRoot(run), 'rootCA.pem');

/** Adds the CA to a simulator's trusted roots. It never touches this machine's own keychain. */
export function trustIos(run: Runner, say: (line?: string) => void, device = 'booted'): void {
  const caFile = rootPem(run);
  const result = run('xcrun', simctlArgs(caFile, device));
  if (result.error !== undefined) throw new Error('xcrun was not found. Install Xcode and its command line tools.');
  if (result.status !== 0) {
    throw new Error(`simctl could not add the CA to "${device}": ${result.stderr.trim() || 'is a simulator booted?'}`);
  }
  say(`The local CA is trusted by the ${device === 'booted' ? 'booted' : device} simulator. Restart the app if it was running.`);
}

export function trustAndroid(run: Runner, say: (line?: string) => void, push: boolean, serial?: string): void {
  const caFile = rootPem(run);
  if (push) {
    const result = run('adb', adbPushArgs(caFile, serial));
    if (result.error !== undefined) throw new Error('adb was not found. Install Android platform-tools.');
    if (result.status !== 0) throw new Error(`adb push failed: ${result.stderr.trim()}`);
    say(`Pushed the CA to ${ANDROID_CA_PATH}. Now install it from Settings (steps below).`);
    say();
  }
  for (const line of ANDROID_STEPS(caFile)) say(line);
}

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

function guard(action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`tempo-api: ${message}\n`);
    process.exit(1);
  }
}

const ios = defineCommand({
  meta: { name: 'ios', description: 'Trust the local CA in an iOS simulator' },
  args: { device: { type: 'string', description: 'Simulator UDID (default: the booted simulator)' } },
  run: ({ args }) => guard(() => trustIos(realRunner, say, args.device)),
});

const android = defineCommand({
  meta: { name: 'android', description: 'Show how to trust the local CA on an Android emulator or device' },
  args: {
    push: { type: 'boolean', description: 'Run `adb push` for you (only the push, the install is done in Settings)' },
    serial: { type: 'string', description: 'adb device serial, when more than one device is connected' },
  },
  run: ({ args }) => guard(() => trustAndroid(realRunner, say, args.push === true, args.serial)),
});

export const trust = defineCommand({
  meta: { name: 'trust', description: 'Trust the local CA on a simulator, emulator or device' },
  subCommands: { ios, android },
});
