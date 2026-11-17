import type { AdminRoute } from './admin.ts';
import type { Engine } from './engine.ts';
import { jsonReply, problemReply } from './http.ts';
import { downloadReply, MEDIA_ID, uploadFailure, uploadJson, type MediaRecord } from './media.ts';

const number = (raw: string | null, fallback: number, max: number): number => (raw !== null && /^\d{1,9}$/.test(raw) ? Math.min(Number(raw), max) : fallback);

/** Admin routes for the Media tab: list, get, upload, preview/download, delete, storage used. */
export function adminMediaRoutes(engine: Engine): AdminRoute[] {
  const media = engine.media;
  const show = (record: MediaRecord): Record<string, unknown> => ({ ...record, url: engine.mediaUrl(record.id) });
  const missing = (id: string | undefined): ReturnType<typeof problemReply> => problemReply(404, { detail: `No media with id '${id ?? ''}'.` });
  return [
    // `usage` is listed before `:id` so it is not read as an id.
    { method: 'GET', pattern: '/media/usage', handler: () => jsonReply(200, { ...media.usage(), maxBytes: engine.definition.media.maxBytes }) },
    {
      method: 'GET',
      pattern: '/media',
      handler: (ctx) => {
        const skip = number(ctx.query.get('skip'), 0, 10_000_000);
        const limit = Math.max(number(ctx.query.get('limit'), 50, 500), 1);
        const type = ctx.query.get('type') ?? undefined;
        const q = ctx.query.get('q') ?? undefined;
        const found = media.list({ skip, limit, ...(type === undefined ? {} : { type }), ...(q === undefined ? {} : { q }) });
        return jsonReply(200, { items: found.items.map(show), total: found.total, skip, limit });
      },
    },
    {
      method: 'POST',
      pattern: '/media',
      handler: async (ctx) => {
        try {
          const records = await media.receive(ctx, { maxBytes: engine.definition.media.maxBytes, multiple: true, uploadedBy: undefined });
          const files = records.map((record) => media.describe(record, engine.mediaUrl(record.id)));
          return uploadJson(files, files.length > 1 || ctx.query.get('multiple') === 'true');
        } catch (error) {
          return uploadFailure(error);
        }
      },
    },
    {
      method: 'GET',
      pattern: '/media/:id',
      handler: (_ctx, params) => {
        const record = media.get(params.id ?? '');
        return record === undefined ? missing(params.id) : jsonReply(200, show(record));
      },
    },
    { method: 'GET', pattern: '/media/:id/file', handler: (ctx, params) => (MEDIA_ID.test(params.id ?? '') ? downloadReply(media, params.id ?? '', ctx.headers) : missing(params.id)) },
    {
      method: 'DELETE',
      pattern: '/media/:id',
      handler: (_ctx, params) => {
        const record = media.get(params.id ?? '');
        if (record === undefined) return missing(params.id);
        media.remove(record.id);
        return jsonReply(200, show(record));
      },
    },
  ];
}
