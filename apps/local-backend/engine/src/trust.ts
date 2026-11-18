import { join } from 'node:path';

import { caRoot, MKCERT_HINT, type Runner } from '@rn-tempo/dev-api';

/** Where the CA lands on an Android device; the user then installs it from Settings. */
export const ANDROID_CA_PATH = '/sdcard/Download/tempo-dev-ca.pem';

/** A simulator id is hex digits and dashes (or the word `booted`). Anything else could be read as a flag. */
export const SIMULATOR_ID = /^(booted|[0-9A-Fa-f][0-9A-Fa-f-]{0,63})$/;
/** An adb serial: letters, digits and a few separators. */
export const ADB_SERIAL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function simctlArgs(caFile: string, device: string): string[] {
  return ['simctl', 'keychain', device, 'add-root-cert', caFile];
}

export function adbPushArgs(caFile: string, serial: string | undefined): string[] {
  return [...(serial === undefined ? [] : ['-s', serial]), 'push', caFile, ANDROID_CA_PATH];
}

const rootPem = (run: Runner): string => join(caRoot(run), 'rootCA.pem');

/**
 * Adds the mkcert CA to this computer's trust stores (`mkcert -install`). This changes the system trust store and may
 * ask for a password, so only an explicit command runs it, and the app asks the user to confirm first.
 */
export function trustMac(run: Runner, say: (line?: string) => void): void {
  const result = run('mkcert', ['-install'], { inherit: true });
  if (result.error !== undefined) throw new Error(MKCERT_HINT);
  if (result.status !== 0) throw new Error(`mkcert -install failed: ${result.stderr.trim() || 'it was cancelled or refused'}`);
  say('The local CA is now trusted on this Mac. Restart your browser if it was open.');
}

/** Adds the CA to a simulator's trusted roots. It never touches this machine's own keychain. */
export function trustIos(run: Runner, say: (line?: string) => void, device = 'booted'): void {
  if (!SIMULATOR_ID.test(device)) throw new Error('That is not a simulator id.');
  const caFile = rootPem(run);
  const result = run('xcrun', simctlArgs(caFile, device));
  if (result.error !== undefined) throw new Error('xcrun was not found. Install Xcode and its command line tools.');
  if (result.status !== 0) throw new Error(`simctl could not add the CA to "${device}": ${result.stderr.trim() || 'is a simulator booted?'}`);
  say(`The local CA is trusted by the ${device === 'booted' ? 'booted' : device} simulator. Restart the app if it was running.`);
}

/** Copies the CA to an Android device's Download folder. The install itself is done in Settings. */
export function trustAndroid(run: Runner, say: (line?: string) => void, serial?: string): void {
  if (serial !== undefined && !ADB_SERIAL.test(serial)) throw new Error('That is not a device serial.');
  const result = run('adb', adbPushArgs(rootPem(run), serial));
  if (result.error !== undefined) throw new Error('adb was not found. Install Android platform-tools.');
  if (result.status !== 0) throw new Error(`adb push failed: ${result.stderr.trim()}`);
  say(`Pushed the CA to ${ANDROID_CA_PATH}. Now open Settings, Security, Encryption and credentials, Install a certificate, CA certificate.`);
}
