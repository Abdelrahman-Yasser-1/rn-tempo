import type { FieldIssue } from '@rn-tempo/api-contract';

import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import type { Handler } from './router.ts';
import type { Collection, CrudEndpoint, Field } from './schema.ts';
import { Store, UniqueViolationError, type ListQuery, type Row } from './store.ts';
import { validateRecord } from './values.ts';

/** Query parameters with a meaning of their own; a field with one of these names cannot be filtered on. */
const RESERVED = new Set(['limit', 'skip', 'page', 'pageSize', 'sort', 'sortBy', 'order', 'q']);

const invalid = (errors: FieldIssue[]): Reply =>
  problemReply(400, { detail: `${errors[0]?.path ?? 'body'}: ${errors[0]?.message ?? 'Invalid request.'}`, errors });

/** A whole number from a query value, or undefined when it is not one. */
function whole(value: string): number | undefined {
  return /^\d{1,9}$/.test(value) ? Number(value) : undefined;
}

function parseId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined;
}

function filterValue(field: Field, raw: string): string | number | undefined {
  switch (field.type) {
    case 'number': {
      const value = Number(raw);
      return raw.trim() !== '' && Number.isFinite(value) ? value : undefined;
    }
    case 'relation':
      return parseId(raw);
    case 'boolean':
      return raw === 'true' ? 1 : raw === 'false' ? 0 : undefined;
    case 'json':
      return undefined;
    default:
      return raw;
  }
}

/** What a crud endpoint needs from the engine to show and check `media` fields. */
export interface CrudServices {
  mediaRecord(id: string): { id: string; originalName: string; mime: string; size: number } | undefined;
  mediaUrl(id: string, origin?: string): string;
}

/** Builds the request handler of one crud endpoint. It captures the definition it was built from. */
export function crudHandler(endpoint: CrudEndpoint, collection: Collection, store: Store, now: () => Date, services: CrudServices): Handler {
  const hidden = new Set(endpoint.hiddenFields);
  const visibleFields = collection.fields.filter((field) => !hidden.has(field.name));
  const visibleNames = new Map(visibleFields.map((field) => [field.name, field]));
  const searchFields = (endpoint.searchFields ?? collection.fields.filter((f) => f.type === 'string' || f.type === 'enum').map((f) => f.name)).filter(
    (name) => !hidden.has(name),
  );
  const owner = endpoint.ownerField;
  const showMedia = (id: unknown, origin: string | undefined): unknown => {
    if (typeof id !== 'string' || endpoint.media === 'id') return id;
    const url = services.mediaUrl(id, origin);
    if (endpoint.media === 'url') return url;
    const record = services.mediaRecord(id);
    return record === undefined ? { id, url } : { id, url, name: record.originalName, mime: record.mime, size: record.size };
  };
  const show = (row: Row, origin?: string): Record<string, unknown> => {
    const out: Record<string, unknown> = { id: row.id };
    for (const field of visibleFields) out[field.name] = field.type === 'media' ? showMedia(row[field.name], origin) : row[field.name];
    return out;
  };
  const mediaExists = (id: string): boolean => services.mediaRecord(id) !== undefined;
  /** The body with the owner field forced to the caller, so a client cannot write rows for someone else. */
  const withOwner = (value: unknown, userId: number | undefined): unknown =>
    owner === undefined || userId === undefined || typeof value !== 'object' || value === null || Array.isArray(value) ? value : { ...value, [owner]: userId };
  const exists = (name: string, id: number): boolean => store.has(name, id);
  const notFound = (raw: string | undefined): Reply =>
    problemReply(404, { detail: `${collection.name} with id '${raw ?? ''}' not found.` });

  function list(query: URLSearchParams, userId: number | undefined, origin: string | undefined): Reply {
    const errors: FieldIssue[] = [];
    const number = (name: string): number | undefined => {
      const raw = query.get(name);
      if (raw === null) return undefined;
      const value = whole(raw);
      if (value === undefined) errors.push({ path: `query.${name}`, message: 'Must be a whole number, 0 or more.' });
      return value;
    };
    const pageParam = number('page');
    const pageSizeParam = number('pageSize');
    const limitParam = number('limit');
    const skipParam = number('skip');
    if (pageParam === 0) errors.push({ path: 'query.page', message: 'Pages start at 1.' });
    if (pageSizeParam === 0) errors.push({ path: 'query.pageSize', message: 'Must be at least 1.' });

    const paged = query.has('page') || query.has('pageSize');
    const size = paged ? (pageSizeParam ?? endpoint.defaultLimit) : (limitParam ?? endpoint.defaultLimit);
    const skip = paged ? ((pageParam ?? 1) - 1) * size : (skipParam ?? 0);
    const limit = size === 0 ? undefined : size; // `limit=0` returns every row, like dummyjson

    const sort: { field: string; desc: boolean }[] = [];
    const sortSpec = query.get('sort') ?? query.get('sortBy');
    if (sortSpec !== null && sortSpec !== '') {
      const descending = query.get('order')?.toLowerCase() === 'desc';
      for (const part of sortSpec.split(',')) {
        const desc = part.startsWith('-') ? true : query.has('sortBy') && !query.has('sort') ? descending : false;
        const name = part.replace(/^-/, '');
        if (name === 'id' || visibleNames.has(name)) sort.push({ field: name, desc });
        else errors.push({ path: 'query.sort', message: `Cannot sort by "${name}".` });
      }
    }

    const where: NonNullable<ListQuery['where']> = [];
    for (const [key, raw] of query) {
      if (RESERVED.has(key)) continue;
      const field = visibleNames.get(key);
      if (field === undefined) continue;
      const value = filterValue(field, raw);
      if (value === undefined) errors.push({ path: `query.${key}`, message: `"${raw}" is not a valid ${field.type} value.` });
      else where.push({ field: key, value });
    }
    if (errors.length > 0) return invalid(errors);
    if (owner !== undefined && userId !== undefined) where.push({ field: owner, value: userId });

    const text = query.get('q');
    const result = store.list(collection.name, {
      where,
      sort,
      skip,
      ...(limit === undefined ? {} : { limit }),
      ...(text === null || text === '' ? {} : { search: { fields: searchFields, text } }),
    });
    const rows = result.rows.map((row) => show(row, origin));
    if (endpoint.listShape === 'paged') {
      const pageSize = limit ?? Math.max(rows.length, 1);
      return jsonReply(200, { items: rows, total: result.total, page: Math.floor(skip / pageSize) + 1, pageSize });
    }
    return jsonReply(200, { [collection.name]: rows, total: result.total, skip, limit: rows.length });
  }

  return (ctx, params) => {
    try {
      const userId = ctx.user?.id;
      if (owner !== undefined && userId === undefined) return problemReply(401, { detail: 'Invalid or expired token' });
      /** A row that belongs to someone else does not exist for this caller. */
      const mine = (row: Row | undefined): Row | undefined => (row === undefined || owner === undefined || row[owner] === userId ? row : undefined);
      switch (endpoint.action) {
        case 'list':
          return list(ctx.query, userId, ctx.origin);
        case 'get': {
          const id = parseId(params.id);
          const row = id === undefined ? undefined : mine(store.get(collection.name, id));
          return row === undefined ? notFound(params.id) : jsonReply(200, show(row, ctx.origin));
        }
        case 'create': {
          const body = readJson(ctx);
          if (!body.ok) return body.reply;
          const checked = validateRecord(collection, withOwner(body.value, userId), { mode: 'create', unknownFields: endpoint.unknownFields, exists, mediaExists });
          if (checked.issues.length > 0) return invalid(checked.issues);
          return jsonReply(endpoint.successStatus ?? 201, show(store.insert(collection.name, checked.values), ctx.origin));
        }
        case 'update': {
          const id = parseId(params.id);
          if (id === undefined || mine(store.get(collection.name, id)) === undefined) return notFound(params.id);
          const body = readJson(ctx);
          if (!body.ok) return body.reply;
          const mode = endpoint.method === 'PATCH' ? 'patch' : 'replace';
          const checked = validateRecord(collection, withOwner(body.value, userId), { mode, unknownFields: endpoint.unknownFields, exists, mediaExists });
          if (checked.issues.length > 0) return invalid(checked.issues);
          const row = store.update(collection.name, id, checked.values);
          return row === undefined ? notFound(params.id) : jsonReply(endpoint.successStatus ?? 200, show(row, ctx.origin));
        }
        case 'delete': {
          const id = parseId(params.id);
          const row = id === undefined ? undefined : mine(store.get(collection.name, id));
          if (id === undefined || row === undefined) return notFound(params.id);
          store.remove(collection.name, id);
          const shown = show(row, ctx.origin);
          return jsonReply(endpoint.successStatus ?? 200, endpoint.deleteMarkers ? { ...shown, isDeleted: true, deletedOn: now().toISOString() } : shown);
        }
      }
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        const path = error.field === undefined ? 'body' : `body.${error.field}`;
        return problemReply(409, { detail: error.message, errors: [{ path, message: 'Already exists.' }] });
      }
      throw error;
    }
  };
}
