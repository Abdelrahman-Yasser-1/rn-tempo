import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ApiConfig } from '@rn-tempo/api-contract';
import type { Logger } from 'pino';

import { seedItems } from '../data.ts';
import { MemoryStore, type StoreState } from '../runtime/store.ts';

export type { Item, StoreState, TokenRecord } from '../runtime/store.ts';

export const DB_FILE = 'db.json';

/**
 * The runtime's in-memory store plus `<dataDir>/db.json`: resource collections and mock-auth tokens
 * are saved after every write. The active scenarios stay in memory only, so a restart is always a
 * clean slate for responses.
 */
export class Store extends MemoryStore {
  private readonly file: string;
  private readonly dataDir: string;
  private readonly logger: Logger;

  constructor(config: ApiConfig, dataDir: string, logger: Logger) {
    super(config, {
      seedItems,
      newId: () => randomUUID(),
      randomToken: () => randomBytes(24).toString('base64url'),
    });
    this.dataDir = dataDir;
    this.logger = logger;
    this.file = join(dataDir, DB_FILE);
    this.load();
  }

  private load(): void {
    mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoreState>;
      this.state = { version: 1, collections: parsed.collections ?? {}, tokens: parsed.tokens ?? {} };
    } catch (error) {
      // A half-written or hand-edited file must not take the server down; keep it for inspection.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      renameSync(this.file, backup);
      this.logger.warn({ backup, err: error instanceof Error ? error.message : String(error) }, 'db.json was unreadable and was moved aside');
    }
  }

  /** Writes the state atomically: a temp file in the same folder, then a rename. */
  protected override changed(): void {
    super.changed();
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temp, this.file);
  }
}
