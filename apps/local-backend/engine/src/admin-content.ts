import type { AdminRoute } from './admin.ts';
import { ContentError, modelOf, type EntryStatus } from './content.ts';
import { contentMount } from './content-public.ts';
import type { Engine } from './engine.ts';
import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import type { Manager } from './manager.ts';
import type { Plan } from './store.ts';

const STATUSES: readonly string[] = ['draft', 'published', 'scheduled'];
const number = (raw: string | null, fallback: number, max: number): number => (raw !== null && /^\d{1,9}$/.test(raw) ? Math.min(Number(raw), max) : fallback);
const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);
/** A type as the admin API lists it has `entries` (a count); sending it back is fine, it is not stored. */
const withoutCount = (value: unknown): unknown => {
  const { entries: _entries, ...rest } = asObject(value);
  return rest;
};
const asObject = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Problem+json for a content problem; anything else is not ours. */
export function contentErrorReply(error: unknown): Reply | undefined {
  if (!(error instanceof ContentError)) return undefined;
  return problemReply(error.status, { detail: error.message, ...(error.issues.length > 0 ? { errors: error.issues } : {}) });
}

/**
 * Admin routes for the Content tab: the settings, the types (a field change migrates stored values; removing data
 * needs `?confirm=true`, else 409) and the entries with their publishing flow and versions.
 */
export function adminContentRoutes(engine: Engine, manager: Manager, errorReply: (error: unknown) => Reply): AdminRoute[] {
  const confirm = (ctx: RequestCtx): boolean => ctx.query.get('confirm') === 'true';
  const model = (): ReturnType<typeof modelOf> => modelOf(engine.definition);
  const raw = (): NonNullable<ReturnType<Manager['definition']>['contentTypes']> => manager.definition().contentTypes ?? [];
  const mediaExists = (id: string): boolean => engine.media.has(id);
  const noType = (name: string | undefined): Reply => problemReply(404, { detail: `No content type "${name ?? ''}".` });

  const guarded = async (work: () => Reply | Promise<Reply>): Promise<Reply> => {
    try {
      return await work();
    } catch (error) {
      return contentErrorReply(error) ?? errorReply(error);
    }
  };
  const withBody = (ctx: RequestCtx, use: (value: unknown) => Reply | Promise<Reply>): Promise<Reply> | Reply => {
    const parsed = readJson(ctx);
    return parsed.ok ? guarded(() => use(parsed.value)) : parsed.reply;
  };
  const applying = (run: () => Promise<Plan>): Promise<Reply> =>
    guarded(async () => {
      await run();
      return jsonReply(200, { ok: true });
    });
  const entryId = (raw: string | undefined): number | Reply => wantId(raw) ?? problemReply(404, { detail: `No entry ${raw ?? ''}.` });
  const withEntry = (params: Record<string, string>, use: (id: number) => Reply | Promise<Reply>): Promise<Reply> => {
    const id = entryId(params.id);
    return typeof id === 'number' ? guarded(() => use(id)) : Promise.resolve(id);
  };

  return [
    {
      method: 'GET',
      pattern: '/content/config',
      handler: () => jsonReply(200, { ...engine.definition.content, mount: contentMount(engine.definition), versionsKept: 10 }),
    },
    // ---- types
    {
      method: 'GET',
      pattern: '/content/types',
      handler: () => jsonReply(200, raw().map((type) => ({ ...type, seed: undefined, entries: engine.content.countEntries(type.name) }))),
    },
    { method: 'POST', pattern: '/content/types', handler: (ctx) => withBody(ctx, (value) => applying(() => manager.addContentType(withoutCount(value) as never, { confirm: confirm(ctx) }))) },
    {
      method: 'GET',
      pattern: '/content/types/:name',
      handler: (_ctx, params) => {
        const found = raw().find((type) => type.name === params.name);
        return found === undefined ? noType(params.name) : jsonReply(200, { ...found, seed: undefined, entries: engine.content.countEntries(found.name) });
      },
    },
    {
      method: 'PUT',
      pattern: '/content/types/:name',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.replaceContentType(params.name ?? '', withoutCount(value) as never, { confirm: confirm(ctx) }))),
    },
    { method: 'DELETE', pattern: '/content/types/:name', handler: (ctx, params) => applying(() => manager.removeContentType(params.name ?? '', { confirm: confirm(ctx) })) },
    {
      method: 'POST',
      pattern: '/content/types/:name/fields',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.addContentField(params.name ?? '', value as never, { confirm: confirm(ctx) }))),
    },
    {
      method: 'DELETE',
      pattern: '/content/types/:name/fields/:field',
      handler: (ctx, params) => applying(() => manager.removeContentField(params.name ?? '', params.field ?? '', { confirm: confirm(ctx) })),
    },
    {
      method: 'POST',
      pattern: '/content/types/:name/fields/:field/rename',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.renameContentField(params.name ?? '', params.field ?? '', String(asObject(value).to ?? ''), { confirm: confirm(ctx) }))),
    },
    // ---- entries
    {
      method: 'GET',
      pattern: '/content/entries',
      handler: (ctx) =>
        guarded(() => {
          const type = ctx.query.get('type') ?? undefined;
          const status = ctx.query.get('status') ?? undefined;
          if (status !== undefined && !STATUSES.includes(status)) return problemReply(400, { detail: `status: Use ${STATUSES.join(', ')}.` });
          const skip = number(ctx.query.get('skip'), 0, 10_000_000);
          const limit = Math.max(number(ctx.query.get('limit'), 50, 500), 1);
          const q = ctx.query.get('q') ?? undefined;
          const found = engine.content.list(model(), {
            ...(type === undefined ? {} : { type }),
            ...(status === undefined ? {} : { status: status as EntryStatus }),
            ...(q === undefined ? {} : { q }),
            skip,
            limit,
          });
          return jsonReply(200, { items: found.items, total: found.total, skip, limit });
        }),
    },
    {
      method: 'POST',
      pattern: '/content/entries',
      handler: (ctx) =>
        withBody(ctx, (value) => {
          const body = asObject(value);
          if (typeof body.type !== 'string') return problemReply(400, { detail: 'type: Send the content type name.', errors: [{ path: 'type', message: 'Required.' }] });
          return jsonReply(201, engine.content.create(model(), { type: body.type, slug: body.slug, values: body.values }, { mediaExists }));
        }),
    },
    {
      method: 'GET',
      pattern: '/content/entries/:id',
      handler: (_ctx, params) =>
        withEntry(params, (id) => {
          const found = engine.content.detail(id);
          return found === undefined ? problemReply(404, { detail: `No entry ${String(id)}.` }) : jsonReply(200, found);
        }),
    },
    {
      method: 'PUT',
      pattern: '/content/entries/:id',
      handler: (ctx, params) =>
        withEntry(params, (id) => {
          const parsed = readJson(ctx);
          if (!parsed.ok) return parsed.reply;
          const body = asObject(parsed.value);
          return jsonReply(200, engine.content.save(model(), id, { slug: body.slug, values: body.values }, { mediaExists }));
        }),
    },
    { method: 'DELETE', pattern: '/content/entries/:id', handler: (_ctx, params) => withEntry(params, (id) => jsonReply(200, engine.content.remove(id))) },
    { method: 'POST', pattern: '/content/entries/:id/publish', handler: (_ctx, params) => withEntry(params, (id) => jsonReply(200, engine.content.publish(model(), id))) },
    { method: 'POST', pattern: '/content/entries/:id/unpublish', handler: (_ctx, params) => withEntry(params, (id) => jsonReply(200, engine.content.unpublish(id))) },
    {
      method: 'POST',
      pattern: '/content/entries/:id/schedule',
      handler: (ctx, params) =>
        withEntry(params, (id) => {
          const parsed = readJson(ctx);
          if (!parsed.ok) return parsed.reply;
          return jsonReply(200, engine.content.schedule(model(), id, asObject(parsed.value).publishAt));
        }),
    },
    { method: 'GET', pattern: '/content/entries/:id/versions', handler: (_ctx, params) => withEntry(params, (id) => jsonReply(200, { items: engine.content.versions(id) })) },
    {
      method: 'GET',
      pattern: '/content/entries/:id/versions/:version',
      handler: (_ctx, params) =>
        withEntry(params, (id) => {
          const version = wantId(params.version);
          if (version === undefined) return problemReply(404, { detail: `No version ${params.version ?? ''}.` });
          return jsonReply(200, { values: engine.content.versionValues(id, version) });
        }),
    },
    {
      method: 'POST',
      pattern: '/content/entries/:id/revert',
      handler: (ctx, params) =>
        withEntry(params, (id) => {
          const parsed = readJson(ctx);
          if (!parsed.ok) return parsed.reply;
          const version = asObject(parsed.value).version;
          if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return problemReply(400, { detail: 'version: Send a version number from the version list.', errors: [{ path: 'version', message: 'Required.' }] });
          return jsonReply(200, engine.content.revert(id, version));
        }),
    },
  ];
}
