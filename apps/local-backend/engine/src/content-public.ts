import { createHash } from 'node:crypto';

import { isBlankValue } from './content-values.ts';
import { modelOf, type ContentModel, type ContentService, type EntryRow, type LocaleValues } from './content.ts';
import { jsonReply, problemReply, type Reply, type RequestCtx } from './http.ts';
import type { MediaRecord } from './media.ts';
import { mountPath } from './router.ts';
import type { Backend, ContentType } from './schema.ts';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PublicContentDeps {
  definition: Backend;
  content: ContentService;
  media: { get(id: string): MediaRecord | undefined };
  mediaUrl(id: string, origin?: string): string;
}

/** A media field as the public API shows it. */
export interface PublicMedia {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * One entry as the public API answers it. The values sit under `fields` (so a field can have any name), in the
 * requested locale; a field that locale leaves empty shows the default locale's value and is listed in `fallbackFields`.
 */
export interface PublicEntry {
  id: number;
  type: string;
  slug: string | null;
  locale: string;
  availableLocales: string[];
  fallbackFields: string[];
  publishedAt: string | null;
  updatedAt: string;
  fields: Record<string, unknown>;
}

/** `GET <mount>/<type>` for a type that is not a singleton. */
export interface PublicList {
  items: PublicEntry[];
  total: number;
  limit: number;
  skip: number;
  /** Pass it as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
}

const SORTS: Readonly<Record<string, 'updatedAt' | 'publishAt'>> = { updatedAt: 'updatedAt', publishedAt: 'publishAt', publishAt: 'publishAt' };

/** The mounted path of the public content API, for example `/api/v1/content`. */
export const contentMount = (definition: Pick<Backend, 'basePath' | 'content'>): string => mountPath(definition.basePath, definition.content.mount);

function whole(raw: string | null): number | undefined {
  return raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
}

function shape(
  deps: PublicContentDeps,
  model: ContentModel,
  type: ContentType,
  row: EntryRow,
  values: LocaleValues,
  locale: string,
  origin: string | undefined,
): PublicEntry {
  const localized = type.localized === true;
  const wanted = localized ? (values[locale] ?? {}) : (values[model.defaultLocale] ?? {});
  const fallback = values[model.defaultLocale] ?? {};
  const fields: Record<string, unknown> = {};
  const fallbackFields: string[] = [];
  for (const field of type.fields) {
    let value: unknown = wanted[field.name];
    if (isBlankValue(value) && localized && locale !== model.defaultLocale && !isBlankValue(fallback[field.name])) {
      value = fallback[field.name];
      fallbackFields.push(field.name);
    }
    if (value === undefined) value = null;
    if (field.type === 'media' && typeof value === 'string') {
      const record = deps.media.get(value);
      value = record === undefined ? null : ({ id: record.id, url: deps.mediaUrl(record.id, origin), name: record.originalName, mime: record.mime, size: record.size } satisfies PublicMedia);
    }
    fields[field.name] = value;
  }
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    locale: localized ? locale : model.defaultLocale,
    availableLocales: localized ? model.locales.filter((code) => Object.values(values[code] ?? {}).some((value) => !isBlankValue(value))) : [model.defaultLocale],
    fallbackFields,
    publishedAt: row.publishAt,
    updatedAt: row.updatedAt,
    fields,
  };
}

/** A body with a weak `ETag`; a matching `If-None-Match` answers 304. */
function cached(ctx: RequestCtx, body: unknown): Reply {
  const tag = `W/"${createHash('sha1').update(JSON.stringify(body)).digest('base64url').slice(0, 22)}"`;
  const given = String(ctx.headers['if-none-match'] ?? '')
    .split(',')
    .map((part) => part.trim());
  const headers = { etag: tag, 'cache-control': 'no-cache' };
  if (given.includes(tag) || given.includes('*')) return { status: 304, headers };
  return jsonReply(200, body, headers);
}

/**
 * The public, read-only content API: `GET <mount>`, `GET <mount>/<type>` and `GET <mount>/<type>/<idOrSlug>`.
 * Only published entries are shown. It needs no sign-in. Returns `undefined` when the path is not under the mount.
 */
export function handleContent(deps: PublicContentDeps, ctx: RequestCtx): Reply | undefined {
  const { definition } = deps;
  if (definition.contentTypes.length === 0) return undefined;
  const base = contentMount(definition);
  if (ctx.path !== base && !ctx.path.startsWith(`${base}/`)) return undefined;
  if (ctx.method !== 'GET') return problemReply(405, { detail: `${ctx.method} is not allowed here.`, headers: { allow: 'GET' } });
  const model = modelOf(definition);
  let parts: string[];
  try {
    parts = ctx.path
      .slice(base.length)
      .split('/')
      .filter((part) => part !== '')
      .map(decodeURIComponent);
  } catch {
    return problemReply(404, { detail: 'Not found.' });
  }
  if (parts.length === 0) {
    return cached(ctx, {
      locales: model.locales,
      defaultLocale: model.defaultLocale,
      types: model.types.map((type) => ({ name: type.name, label: type.label ?? type.name, localized: type.localized === true, singleton: type.singleton === true, fields: type.fields.map((field) => ({ name: field.name, type: field.type })) })),
    });
  }
  const type = model.types.find((candidate) => candidate.name === parts[0]);
  if (type === undefined || parts.length > 2) return problemReply(404, { detail: `No content type "${parts[0] ?? ''}".` });
  const locale = ctx.query.get('locale') ?? model.defaultLocale;
  if (!model.locales.includes(locale)) {
    return problemReply(400, { detail: `locale: Unknown locale "${locale}". Use one of: ${model.locales.join(', ')}.`, errors: [{ path: 'locale', message: 'Unknown locale.' }] });
  }
  const one = (row: EntryRow | undefined, what: string): Reply => {
    if (row === undefined) return problemReply(404, { detail: `No published ${type.name} ${what}.` });
    return cached(ctx, shape(deps, model, type, row, deps.content.valuesOf([row.id]).get(row.id) ?? {}, locale, ctx.origin));
  };
  if (parts.length === 2) return one(deps.content.publishedOne(type.name, parts[1] ?? ''), `"${parts[1] ?? ''}"`);
  if (type.singleton === true) return one(deps.content.publishedSingleton(type.name), 'entry');

  const sortName = (ctx.query.get('sort') ?? '-publishedAt').replace(/^-/, '');
  const sort = SORTS[sortName];
  const limit = ctx.query.has('limit') ? whole(ctx.query.get('limit')) : DEFAULT_PAGE_SIZE;
  const skipParam = ctx.query.has('cursor') ? whole(ctx.query.get('cursor')) : ctx.query.has('skip') ? whole(ctx.query.get('skip')) : 0;
  const problems: { path: string; message: string }[] = [];
  if (sort === undefined) problems.push({ path: 'sort', message: 'Use updatedAt, publishedAt, -updatedAt or -publishedAt.' });
  if (limit === undefined || limit < 1 || limit > MAX_PAGE_SIZE) problems.push({ path: 'limit', message: `Use a number from 1 to ${String(MAX_PAGE_SIZE)}.` });
  if (skipParam === undefined) problems.push({ path: ctx.query.has('cursor') ? 'cursor' : 'skip', message: 'Use a whole number (a cursor is the nextCursor of the previous page).' });
  if (problems.length > 0 || sort === undefined || limit === undefined || skipParam === undefined) {
    return problemReply(400, { detail: `${problems[0]?.path ?? 'query'}: ${problems[0]?.message ?? 'Invalid.'}`, errors: problems });
  }
  const desc = (ctx.query.get('sort') ?? '-publishedAt').startsWith('-');
  const found = deps.content.published(type.name, { sort, desc, skip: skipParam, limit });
  const values = deps.content.valuesOf(found.rows.map((row) => row.id));
  const items = found.rows.map((row) => shape(deps, model, type, row, values.get(row.id) ?? {}, locale, ctx.origin));
  const next = skipParam + items.length;
  const body: PublicList = { items, total: found.total, limit, skip: skipParam, nextCursor: next < found.total ? String(next) : null };
  return cached(ctx, body);
}
