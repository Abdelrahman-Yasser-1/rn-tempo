import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Paths } from './paths.ts';
import type { PidRecord, Scheme, Target } from './process.ts';

export const CERT_FILE = 'cert.pem';
export const KEY_FILE = 'key.pem';
/** The public CA certificate, copied next to the leaf so the CLI can trust exactly that CA. */
export const CA_FILE = 'rootCA.pem';

export const NO_CERT_NOTICE = 'No certificate: serving HTTP. Run `yarn api certs` for HTTPS.';

export function hasCerts(paths: Paths): boolean {
  return existsSync(join(paths.certsDir, CERT_FILE)) && existsSync(join(paths.certsDir, KEY_FILE));
}

/** HTTPS when both files exist, unless `--http` forces plain HTTP. */
export function chooseScheme(paths: Paths, forceHttp: boolean): Scheme {
  return !forceHttp && hasCerts(paths) ? 'https' : 'http';
}

export function readTls(paths: Paths): { cert: Buffer; key: Buffer } {
  return { cert: readFileSync(join(paths.certsDir, CERT_FILE)), key: readFileSync(join(paths.certsDir, KEY_FILE)) };
}

/** True when the certificate lists this IP address, so a phone can open `https://<ip>`. */
export function certCoversIp(certPem: Buffer | string, ip: string): boolean {
  try {
    return new X509Certificate(certPem).checkIP(ip) !== undefined;
  } catch {
    return false;
  }
}

/** The loopback target for a pid record, trusting the CA that was generated for this project. */
export function targetFor(paths: Paths, record: Pick<PidRecord, 'port' | 'scheme'>): Target {
  if (record.scheme === 'http') return { scheme: 'http', port: record.port };
  const caFile = join(paths.certsDir, CA_FILE);
  return { scheme: 'https', port: record.port, ...(existsSync(caFile) ? { ca: readFileSync(caFile, 'utf8') } : {}) };
}
