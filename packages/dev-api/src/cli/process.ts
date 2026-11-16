import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

export interface PidRecord {
  pid: number;
  port: number;
  host: string;
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
      return { pid: parsed.pid, port: parsed.port, host: parsed.host ?? '127.0.0.1' };
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

/** The dev API's health at a port, or undefined when nothing answers or it is not the dev API. */
export async function fetchHealth(port: number, timeoutMs = 1000): Promise<Health | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__tempo/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as Partial<Health>;
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
