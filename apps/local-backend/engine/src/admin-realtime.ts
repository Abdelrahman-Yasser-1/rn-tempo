import type { Engine } from './engine.ts';
import { jsonReply, problemReply, readJson } from './http.ts';
import { sendManual } from './realtime.ts';
import type { AdminRoute } from './admin.ts';
import type { Endpoint } from './schema.ts';

type LiveEndpoint = Extract<Endpoint, { type: 'sse' }>;

const isLive = (endpoint: Endpoint | undefined): endpoint is LiveEndpoint => endpoint !== undefined && endpoint.type === 'sse';

/**
 * The dashboard's Live panel: who is connected to an SSE, WebSocket or GraphQL endpoint, what was sent lately, a manual
 * message to one client or all, and disconnecting a client. Reads need the viewer role, the other routes the editor role.
 */
export function adminRealtimeRoutes(engine: Engine): AdminRoute[] {
  const endpointOf = (id: string | undefined): LiveEndpoint | undefined => {
    const found = engine.definition.endpoints.find((candidate) => candidate.id === id);
    return isLive(found) ? found : undefined;
  };
  const missing = (id: string | undefined) => problemReply(404, { detail: `No sse endpoint "${id ?? ''}".` });
  return [
    {
      method: 'GET',
      pattern: '/realtime/:endpointId/clients',
      handler: (_ctx, params) => {
        const endpoint = endpointOf(params.endpointId);
        if (endpoint === undefined) return missing(params.endpointId);
        return jsonReply(200, { type: endpoint.type, clients: engine.realtime.existing(endpoint.id)?.list() ?? [] });
      },
    },
    {
      method: 'GET',
      pattern: '/realtime/:endpointId/messages',
      handler: (_ctx, params) => {
        const endpoint = endpointOf(params.endpointId);
        if (endpoint === undefined) return missing(params.endpointId);
        return jsonReply(200, { messages: engine.realtime.existing(endpoint.id)?.recent() ?? [] });
      },
    },
    {
      method: 'POST',
      pattern: '/realtime/:endpointId/send',
      handler: (ctx, params) => {
        const endpoint = endpointOf(params.endpointId);
        if (endpoint === undefined) return missing(params.endpointId);
        const parsed = readJson(ctx);
        if (!parsed.ok) return parsed.reply;
        const body = typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value) ? (parsed.value as Record<string, unknown>) : {};
        if (!('data' in body)) return problemReply(400, { detail: 'Send { "data": ... } (and optionally "event" and "clientId").', errors: [{ path: 'data', message: 'Required.' }] });
        const event = body.event;
        if (event !== undefined && (typeof event !== 'string' || !/^[^\r\n]{1,100}$/.test(event))) return problemReply(400, { detail: 'event must be one line of text.', errors: [{ path: 'event', message: 'Must be one line of text.' }] });
        const clientId = body.clientId;
        if (clientId !== undefined && typeof clientId !== 'string') return problemReply(400, { detail: 'clientId must be text.', errors: [{ path: 'clientId', message: 'Must be text.' }] });
        const hub = engine.realtime.hub(endpoint.id, endpoint.type);
        engine.realtime.track(endpoint);
        const sent = sendManual(hub, endpoint.bufferSize, { event, data: body.data }, clientId);
        return jsonReply(200, { sent });
      },
    },
    {
      method: 'DELETE',
      pattern: '/realtime/:endpointId/clients/:clientId',
      handler: (_ctx, params) => {
        const endpoint = endpointOf(params.endpointId);
        if (endpoint === undefined) return missing(params.endpointId);
        const client = engine.realtime.existing(endpoint.id)?.get(params.clientId ?? '');
        if (client === undefined) return problemReply(404, { detail: `No client "${params.clientId ?? ''}" is connected.` });
        client.close(1000, 'Disconnected from the dashboard.');
        return jsonReply(200, { ok: true });
      },
    },
  ];
}
