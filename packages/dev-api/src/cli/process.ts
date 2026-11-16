import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { networkInterfaces } from 'node:os';

export type Scheme = 'http' | 'https';

export interface PidRecord {
  pid: number;
  port: number;
  host: string;
  /** How the server speaks. Records written before HTTPS existed have no scheme and mean `http`. */
  scheme: Scheme;
}

/** Where the CLI reaches its own server: always loopback, over the scheme the record names. */
export interface Target {
  scheme: Scheme;
  port: number;
  /** PEM of the CA that signed the server certificate. It is the only thing trusted over HTTPS. */
  ca?: string;
}

export interface Health {
  ok: boolean;
  service: string;
  pid: number;
  startedAt: string;
  scenarios: Record<string, string>;
}

export function readPid(file: string): PidRecord | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PidRecord>;
    if (typeof parsed.pid === 'number' && typeof parsed.port === 'number') {
      return { pid: parsed.pid, port: parsed.port, host: parsed.host ?? '127.0.0.1', scheme: parsed.scheme === 'https' ? 'https' : 'http' };
    }
  } catch {
    // An unreadable pid file is treated as stale.
  }
  return undefined;
}

export function writePid(file: string, record: PidRecord): void {
  writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
}

export function removePid(file: string): void {
  rmSync(file, { force: true });
}

/** True when a process with this pid exists (signal 0 checks without sending anything). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface ControlResponse {
  status: number;
  text: string;
}

/**
 * One request to the local server. Over HTTPS it trusts only `target.ca` and checks the certificate
 * as usual (the 127.0.0.1 address is in the certificate); certificate checks are never switched off.
 */
export function localRequest(
  target: Target,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<ControlResponse> {
  const send = target.scheme === 'https' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      {
        host: '127.0.0.1',
        port: target.port,
        path,
        method: init.method ?? 'GET',
        headers: init.headers,
        signal: AbortSignal.timeout(init.timeoutMs ?? 5000),
        ...(target.scheme === 'https' && target.ca !== undefined ? { ca: target.ca } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

/** The dev API's health, or undefined when nothing answers, the certificate is not trusted, or it is not the dev API. */
export async function fetchHealth(target: Target, timeoutMs = 1000): Promise<Health | undefined> {
  try {
    const res = await localRequest(target, '/__tempo/health', { timeoutMs });
    if (res.status < 200 || res.status > 299) return undefined;
    const body = JSON.parse(res.text) as Partial<Health>;
    return body.service === 'tempo-dev-api' && typeof body.pid === 'number' ? (body as Health) : undefined;
  } catch {
    return undefined;
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** First non-internal IPv4 address, for the URL a phone on the same network can reach. */
export function lanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return undefined;
}
