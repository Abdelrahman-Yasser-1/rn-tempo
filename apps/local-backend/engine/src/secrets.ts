import { randomBytes } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SECRETS_FILE } from './tokens.ts';
import { DefinitionError } from './schema.ts';

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads and updates `.data/secrets.json` (mode 0600), the one file that holds a backend's secrets: the JWT secret, the
 * webhook signing secrets, the FCM and APNs credentials, the OAuth client secrets and signing key. It is read without
 * following a link, written next to itself (`wx`) and renamed over, and it is never part of a snapshot, an export, a
 * log or an answer. Callers hand out only derived facts ("configured", a key id), never the file's contents.
 */
export class SecretStore {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, SECRETS_FILE);
  }

  read(): Bag {
    try {
      if (lstatSync(this.path).isSymbolicLink()) throw new DefinitionError(`.data/${SECRETS_FILE} is a symbolic link and is not used.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(fd).isFile()) throw new DefinitionError(`.data/${SECRETS_FILE} is not a file.`);
      const parsed: unknown = JSON.parse(readFileSync(fd, 'utf8'));
      return isBag(parsed) ? parsed : {};
    } finally {
      closeSync(fd);
    }
  }

  /** Changes the file in one atomic write. `change` edits the parsed object in place. */
  update(change: (bag: Bag) => void): void {
    const bag = this.read();
    change(bag);
    const temp = `${this.path}.${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(temp, `${JSON.stringify(bag, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    const fd = openSync(temp, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, this.path);
  }

  /** One named section (`webhooks`, `push`, `oauth`) as an object. */
  section(name: string): Bag {
    const value = this.read()[name];
    return isBag(value) ? value : {};
  }

  setSection(name: string, change: (section: Bag) => void): void {
    this.update((bag) => {
      const current = isBag(bag[name]) ? (bag[name] as Bag) : {};
      change(current);
      if (Object.keys(current).length === 0) delete bag[name];
      else bag[name] = current;
    });
  }
}

/** A fresh random secret, URL-safe. */
export const newSecret = (prefix: string): string => `${prefix}_${randomBytes(24).toString('base64url')}`;

/** Every secret string this file holds (for the tests and the redaction of logs): the leaves of every value except the JWT secret's own field. */
export function secretStrings(bag: unknown, out: string[] = []): string[] {
  if (typeof bag === 'string') {
    if (bag.length >= 8) out.push(bag);
  } else if (Array.isArray(bag)) for (const item of bag) secretStrings(item, out);
  else if (isBag(bag)) for (const item of Object.values(bag)) secretStrings(item, out);
  return out;
}
