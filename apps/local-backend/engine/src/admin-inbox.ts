import type { AdminRoute } from './admin.ts';
import type { Engine } from './engine.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import { curlOf, replayHeaders } from './inbox.ts';
import { checkOutboundUrl, OutboundError } from './outbound.ts';
import { mountPath } from './router.ts';

const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);

/**
 * The dashboard's Inbox: the list (sizes and masked headers; any role that can read), one request with its body, a curl
 * command and a replay to a URL (editor), and clearing. A replay goes through the same SSRF rules as a webhook.
 */
export function adminInboxRoutes(engine: Engine): AdminRoute[] {
  const missing = (id: string | undefined): Reply => problemReply(404, { detail: `No captured request ${id ?? ''}.` });
  const baseUrl = (path: string): string => `${engine.definition.https ? 'https' : 'http'}://localhost:${String(engine.definition.port)}${engine.publicPrefix}${mountPath(engine.definition.basePath, path)}`;
  return [
    {
      method: 'GET',
      pattern: '/inbox',
      handler: (ctx) => {
        const limit = Number(ctx.query.get('limit') ?? 100);
        const endpoint = ctx.query.get('endpoint') ?? undefined;
        return jsonReply(200, { entries: engine.inbox.list(endpoint, Number.isFinite(limit) ? limit : 100), ...engine.inbox.stats() });
      },
    },
    {
      method: 'GET',
      pattern: '/inbox/:id',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        const entry = id === undefined ? undefined : engine.inbox.get(id);
        if (entry === undefined) return missing(params.id);
        return jsonReply(200, { ...entry, curl: curlOf(entry, `${baseUrl(entry.path)}${entry.query === '' ? '' : `?${entry.query}`}`) });
      },
    },
    {
      method: 'POST',
      pattern: '/inbox/:id/replay',
      handler: async (ctx, params) => {
        const id = wantId(params.id);
        const entry = id === undefined ? undefined : engine.inbox.get(id);
        if (entry === undefined) return missing(params.id);
        const parsed = readJson(ctx);
        if (!parsed.ok) return parsed.reply;
        const url = typeof parsed.value === 'object' && parsed.value !== null ? (parsed.value as { url?: unknown }).url : undefined;
        if (typeof url !== 'string') return problemReply(400, { detail: 'Send { "url" }.', errors: [{ path: 'url', message: 'Required.' }] });
        try {
          checkOutboundUrl(url, engine.outbound);
          const answer = await engine.outboundTransport({ url, method: entry.method === 'GET' || entry.method === 'HEAD' ? 'POST' : entry.method, headers: replayHeaders(entry.headers), body: Buffer.from(entry.body, entry.encoding === 'utf8' ? 'utf8' : 'base64'), timeoutMs: 10_000 }, engine.outbound);
          return jsonReply(200, { status: answer.status, body: answer.body });
        } catch (error) {
          return problemReply(error instanceof OutboundError ? 400 : 502, { detail: error instanceof OutboundError ? error.message : 'The call failed.' });
        }
      },
    },
    {
      method: 'DELETE',
      pattern: '/inbox',
      handler: (ctx) => jsonReply(200, { deleted: engine.inbox.clear(ctx.query.get('endpoint') ?? undefined) }),
    },
  ];
}
