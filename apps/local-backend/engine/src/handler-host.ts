import { redactDeep } from '@rn-tempo/dev-api';

import type { MediaService } from './media.ts';
import type { HandlerRpc } from './handlers.ts';
import type { EngineLogger } from './logs.ts';
import type { Backend, Collection } from './schema.ts';
import type { ListQuery, Store } from './store.ts';
import { isPlainObject, validateRecord } from './values.ts';

export interface HostDeps {
  store: Store;
  definition: () => Backend;
  media: MediaService;
  mediaUrl: (id: string, origin?: string) => string;
  logger: EngineLogger | undefined;
}

const asString = (value: unknown, what: string): string => {
  if (typeof value !== 'string') throw new Error(`${what} must be a string.`);
  return value;
};

const asId = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('The id must be a positive whole number.');
  return value;
};

/**
 * What a handler may ask the main thread for. The database stays owned by the main thread: a handler only
 * sends a collection name and values, which go through the same validation and parameterized statements as
 * the crud endpoints. There is no raw SQL.
 */
export function createHandlerRpc(deps: HostDeps, label: string): HandlerRpc {
  const collectionOf = (raw: unknown): Collection => {
    const name = asString(raw, 'The collection');
    const found = deps.definition().collections.find((collection) => collection.name === name);
    if (found === undefined) throw new Error(`No collection "${name}".`);
    return found;
  };
  const exists = (name: string, id: number): boolean => deps.store.has(name, id);
  const mediaExists = (id: string): boolean => deps.media.has(id);
  const check = (collection: Collection, data: unknown, mode: 'create' | 'patch'): Record<string, unknown> => {
    const checked = validateRecord(collection, data, { mode, unknownFields: 'reject', exists, mediaExists });
    if (checked.issues.length > 0) throw new Error(`${checked.issues[0]?.path ?? 'body'}: ${checked.issues[0]?.message ?? 'Invalid.'}`);
    return checked.values;
  };

  return (method, args) => {
    switch (method) {
      case 'db.list': {
        const collection = collectionOf(args[0]);
        const options = isPlainObject(args[1]) ? args[1] : {};
        const where: NonNullable<ListQuery['where']> = [];
        if (isPlainObject(options.where)) {
          for (const [field, value] of Object.entries(options.where)) {
            if (typeof value === 'boolean') where.push({ field, value: value ? 1 : 0 });
            else if (typeof value === 'string' || typeof value === 'number') where.push({ field, value });
            else throw new Error(`The filter on "${field}" must be a string, number or boolean.`);
          }
        }
        const sort: { field: string; desc: boolean }[] = [];
        if (typeof options.sort === 'string' && options.sort !== '') {
          for (const part of options.sort.split(',')) sort.push({ field: part.replace(/^-/, ''), desc: part.startsWith('-') });
        }
        const limit = typeof options.limit === 'number' && Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 10_000) : 100;
        const skip = typeof options.skip === 'number' && Number.isInteger(options.skip) && options.skip > 0 ? options.skip : 0;
        const text = typeof options.q === 'string' ? options.q : '';
        const searchFields = collection.fields.filter((field) => field.type === 'string' || field.type === 'enum').map((field) => field.name);
        return deps.store.list(collection.name, { where, sort, limit, skip, ...(text === '' ? {} : { search: { fields: searchFields, text } }) });
      }
      case 'db.get':
        return deps.store.get(collectionOf(args[0]).name, asId(args[1])) ?? null;
      case 'db.count':
        return deps.store.count(collectionOf(args[0]).name);
      case 'db.create': {
        const collection = collectionOf(args[0]);
        return deps.store.insert(collection.name, check(collection, args[1], 'create'));
      }
      case 'db.update': {
        const collection = collectionOf(args[0]);
        const id = asId(args[1]);
        if (!deps.store.has(collection.name, id)) return null;
        return deps.store.update(collection.name, id, check(collection, args[2], 'patch')) ?? null;
      }
      case 'db.delete': {
        const collection = collectionOf(args[0]);
        const id = asId(args[1]);
        const row = deps.store.get(collection.name, id);
        if (row === undefined) return null;
        deps.store.remove(collection.name, id);
        return row;
      }
      case 'media.get': {
        const record = deps.media.get(asString(args[0], 'The media id'));
        const origin = typeof args[1] === 'string' ? args[1] : undefined;
        return record === undefined ? null : deps.media.describe(record, deps.mediaUrl(record.id, origin));
      }
      case 'media.url':
        return deps.mediaUrl(asString(args[0], 'The media id'), typeof args[1] === 'string' ? args[1] : undefined);
      case 'log': {
        const level = args[0] === 'warn' || args[0] === 'error' ? args[0] : 'info';
        const message = String(args[1] ?? '').slice(0, 2000);
        const fields = isPlainObject(args[2]) ? { fields: redactDeep(args[2]) } : {};
        deps.logger?.[level]({ handler: label, ...fields }, `handler: ${message}`);
        return undefined;
      }
      default:
        throw new Error(`Unknown request "${method}".`);
    }
  };
}
