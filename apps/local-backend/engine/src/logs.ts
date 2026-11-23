import { closeSync, fstatSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { createLogger } from './shared/logger.ts';

import { openAppendNoFollow } from './folder.ts';

export const REQUEST_LOG_PATTERN = /^requests-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface RequestFilesOptions {
  dir: string;
  /** Days of request files to keep (default 7). */
  keepDays?: number;
  /** Total size of all request files (default 50 MB). The oldest go first. */
  maxBytes?: number;
  now?: () => Date;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Appends already-redacted request entries to `requests-YYYY-MM-DD.jsonl`, one JSON object per line. Files
 * older than `keepDays` are deleted, and the oldest files go when the total passes `maxBytes`.
 */
export class RequestFiles {
  private readonly dir: string;
  private readonly keepDays: number;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private fd: number | undefined;
  private current = '';
  private total = 0;

  constructor(options: RequestFilesOptions) {
    this.dir = options.dir;
    this.keepDays = options.keepDays ?? 7;
    this.maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
    this.now = options.now ?? ((): Date => new Date());
    this.prune();
  }

  append(entry: unknown): void {
    const today = day(this.now());
    if (today !== this.current || this.fd === undefined) this.rotate(today);
    const line = `${JSON.stringify(entry)}\n`;
    if (this.fd === undefined) return;
    writeSync(this.fd, line);
    this.total += Buffer.byteLength(line);
    if (this.total > this.maxBytes) this.prune();
  }

  private rotate(today: string): void {
    if (this.fd !== undefined) closeSync(this.fd);
    this.current = today;
    this.fd = openAppendNoFollow(join(this.dir, `requests-${today}.jsonl`));
    this.prune();
  }

  /** Deletes expired files, then the oldest until the total fits. The file being written is trimmed last. */
  prune(): void {
    const cutoff = day(new Date(this.now().getTime() - this.keepDays * 86_400_000));
    const files = readdirSync(this.dir)
      .map((name) => ({ name, date: REQUEST_LOG_PATTERN.exec(name)?.[1] }))
      .filter((file): file is { name: string; date: string } => file.date !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
    let total = 0;
    const kept: { name: string; date: string; size: number }[] = [];
    for (const file of files) {
      if (file.date <= cutoff && file.date !== this.current) {
        unlinkSync(join(this.dir, file.name));
        continue;
      }
      const size = statSync(join(this.dir, file.name)).size;
      kept.push({ ...file, size });
      total += size;
    }
    for (const file of kept) {
      if (total <= this.maxBytes) break;
      if (file.date === this.current) continue;
      unlinkSync(join(this.dir, file.name));
      total -= file.size;
    }
    if (total > this.maxBytes && this.fd !== undefined) {
      // Only today's file is left and it alone is over the cap: start it again.
      const size = fstatSync(this.fd).size;
      closeSync(this.fd);
      unlinkSync(join(this.dir, `requests-${this.current}.jsonl`));
      this.fd = openAppendNoFollow(join(this.dir, `requests-${this.current}.jsonl`));
      total -= size;
    }
    this.total = total;
  }

  close(): void {
    if (this.fd !== undefined) closeSync(this.fd);
    this.fd = undefined;
  }
}

/** A pino destination that appends to `engine.log`, starting a fresh file (the old one kept as `.1`) past `maxBytes`. */
export class EngineLogStream {
  private fd: number;
  private size = 0;
  private readonly path: string;
  private readonly maxBytes: number;

  constructor(path: string, maxBytes: number) {
    this.path = path;
    this.maxBytes = maxBytes;
    this.fd = openAppendNoFollow(path);
    this.size = fstatSync(this.fd).size;
  }

  write(message: string): void {
    if (this.size > this.maxBytes) {
      closeSync(this.fd);
      renameSync(this.path, `${this.path}.1`);
      this.fd = openAppendNoFollow(this.path);
      this.size = 0;
    }
    writeSync(this.fd, message);
    this.size += Buffer.byteLength(message);
  }

  close(): void {
    closeSync(this.fd);
  }
}

export interface EngineLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

/** The engine's own log: JSON lines in `.data/logs/engine.log`, redacted by dev-api's logger. */
export function createEngineLog(dir: string): { logger: EngineLogger; close(): void } {
  const stream = new EngineLogStream(join(dir, 'engine.log'), 5 * 1024 * 1024);
  return { logger: createLogger({ destination: stream }), close: () => stream.close() };
}
