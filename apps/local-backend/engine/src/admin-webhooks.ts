import type { AdminRoute } from './admin.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import type { Engine } from './engine.ts';
import type { Manager, RawDefinition } from './manager.ts';
import { checkOutboundUrl, OutboundError } from './outbound.ts';
import { safeUrl } from './webhooks.ts';
import { DefinitionError, issuesFromZod, WebhookSchema, type Webhook } from './schema.ts';

const HIDDEN = '[REDACTED]';

/** A copy of a body or an item with the values of every webhook's `headers` hidden: they may carry a receiver's token. For the audit only. */
export function webhookAuditBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(webhookAuditBody);
  if (typeof value !== 'object' || value === null) return value;
  const isHook = 'url' in value && 'events' in value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isHook && key === 'headers' && typeof child === 'object' && child !== null ? Object.fromEntries(Object.keys(child).map((name) => [name, HIDDEN])) : webhookAuditBody(child),
    ]),
  );
}

const asObject = (value: unknown): Record<string, unknown> | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

/**
 * Settings → Webhooks: create, change and delete webhooks (editor), rotate a signing secret (admin), the delivery log,
 * redeliver and a test event. A secret is handed out once, when it is made; no route reads it back.
 */
export function adminWebhookRoutes(engine: Engine, manager: Manager, errorReply: (error: unknown) => Reply): AdminRoute[] {
  const hooks = (): Webhook[] => engine.definition.webhooks;
  const find = (id: string | undefined): Webhook | undefined => hooks().find((hook) => hook.id === id);
  const missing = (id: string | undefined): Reply => problemReply(404, { detail: `No webhook "${id ?? ''}".` });
  /** What any reader sees: header values and the address's userinfo and query values are hidden. */
  const view = (hook: Webhook): Record<string, unknown> => ({
    ...hook,
    url: safeUrl(hook.url),
    ...(hook.headers === undefined ? {} : { headers: Object.fromEntries(Object.keys(hook.headers).map((name) => [name, HIDDEN])) }),
    secretConfigured: engine.webhooks.hasSecret(hook),
  });
  /** What an editor opening the webhook for editing sees: the address and headers as written. Never the secret. */
  const full = (hook: Webhook): Record<string, unknown> => ({ ...hook, secretConfigured: engine.webhooks.hasSecret(hook) });

  /** Parses a webhook from a request body and checks its address against this server's outbound rules. */
  const parse = (value: unknown, id?: string): { ok: true; hook: Webhook; raw: Record<string, unknown> } | { ok: false; reply: Reply } => {
    const body = asObject(value);
    if (body === undefined) return { ok: false, reply: problemReply(400, { detail: 'Send a JSON object.' }) };
    if (id !== undefined && body.id !== undefined && body.id !== id) return { ok: false, reply: problemReply(400, { detail: 'A webhook\'s id cannot be changed. Create a new webhook instead.', errors: [{ path: 'id', message: 'Cannot be changed.' }] }) };
    const raw = id === undefined ? body : { ...body, id };
    const parsed = WebhookSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reply: errorReply(new DefinitionError('The webhook is not valid:', issuesFromZod(parsed.error))) };
    try {
      checkOutboundUrl(parsed.data.url, engine.outbound);
    } catch (error) {
      return { ok: false, reply: problemReply(400, { detail: error instanceof OutboundError ? error.message : 'The address is not allowed.', errors: [{ path: 'url', message: 'Not allowed here.' }] }) };
    }
    return { ok: true, hook: parsed.data, raw };
  };
  const rawHooks = (draft: RawDefinition): Record<string, unknown>[] => {
    const list = ((draft as Record<string, unknown>).webhooks ?? []) as Record<string, unknown>[];
    (draft as Record<string, unknown>).webhooks = list;
    return list;
  };

  return [
    { method: 'GET', pattern: '/webhooks', handler: () => jsonReply(200, hooks().map(view)) },
    {
      method: 'POST',
      pattern: '/webhooks',
      handler: async (ctx) => {
        const body = readJson(ctx);
        if (!body.ok) return body.reply;
        const parsed = parse(body.value);
        if (!parsed.ok) return parsed.reply;
        if (find(parsed.hook.id) !== undefined) return problemReply(409, { detail: `There is already a webhook "${parsed.hook.id}".` });
        try {
          await manager.edit((draft) => void rawHooks(draft).push(parsed.raw));
        } catch (error) {
          return errorReply(error);
        }
        const created = find(parsed.hook.id) ?? parsed.hook;
        return jsonReply(201, { webhook: view({ ...created }), secret: engine.webhooks.createSecret(created) });
      },
    },
    { method: 'GET', pattern: '/webhooks/:id/full', handler: (_ctx, params) => { const hook = find(params.id); return hook === undefined ? missing(params.id) : jsonReply(200, full(hook)); } },
    { method: 'GET', pattern: '/webhooks/:id', handler: (_ctx, params) => { const hook = find(params.id); return hook === undefined ? missing(params.id) : jsonReply(200, view(hook)); } },
    {
      method: 'PUT',
      pattern: '/webhooks/:id',
      handler: async (ctx, params) => {
        const existing = find(params.id);
        if (existing === undefined) return missing(params.id);
        const body = readJson(ctx);
        if (!body.ok) return body.reply;
        const parsed = parse(body.value, params.id ?? '');
        if (!parsed.ok) return parsed.reply;
        try {
          await manager.edit((draft) => {
            const list = rawHooks(draft);
            const at = list.findIndex((hook) => hook.id === params.id);
            list[at] = parsed.raw;
          });
        } catch (error) {
          return errorReply(error);
        }
        const updated = find(params.id);
        if (updated === undefined) return missing(params.id);
        // A new address or body template ends the old secret, so a payload is never signed for a receiver the secret was not made for.
        return jsonReply(200, engine.webhooks.bindingChanged(existing, updated) ? { ...view(updated), secret: engine.webhooks.rotateSecret(updated) } : view(updated));
      },
    },
    {
      method: 'DELETE',
      pattern: '/webhooks/:id',
      handler: async (_ctx, params) => {
        const hook = find(params.id);
        if (hook === undefined) return missing(params.id);
        try {
          await manager.edit((draft) => {
            (draft as Record<string, unknown>).webhooks = rawHooks(draft).filter((item) => item.id !== params.id);
          });
        } catch (error) {
          return errorReply(error);
        }
        engine.webhooks.forgetSecret(hook);
        return jsonReply(200, { ok: true });
      },
    },
    {
      method: 'POST',
      pattern: '/webhooks/:id/rotate-secret',
      handler: (_ctx, params) => {
        const hook = find(params.id);
        return hook === undefined ? missing(params.id) : jsonReply(200, { secret: engine.webhooks.rotateSecret(hook) });
      },
    },
    {
      method: 'POST',
      pattern: '/webhooks/:id/test',
      handler: (_ctx, params) => {
        const hook = find(params.id);
        return hook === undefined ? missing(params.id) : jsonReply(202, engine.webhooks.sendTest(hook));
      },
    },
    {
      method: 'GET',
      pattern: '/webhook-deliveries',
      handler: (ctx) => {
        const limit = Number(ctx.query.get('limit') ?? 100);
        const webhookId = ctx.query.get('webhook') ?? undefined;
        return jsonReply(200, engine.webhooks.deliveries({ ...(webhookId === undefined ? {} : { webhookId }), ...(Number.isFinite(limit) ? { limit } : {}) }));
      },
    },
    {
      method: 'GET',
      pattern: '/webhook-deliveries/:id',
      handler: (_ctx, params) => {
        const found = engine.webhooks.delivery(params.id ?? '');
        return found === undefined ? problemReply(404, { detail: `No delivery "${params.id ?? ''}".` }) : jsonReply(200, found);
      },
    },
    {
      method: 'POST',
      pattern: '/webhook-deliveries/:id/redeliver',
      handler: (_ctx, params) => {
        if (engine.webhooks.addressChanged(params.id ?? '')) return problemReply(409, { detail: 'The webhook\'s address changed since this delivery, so it is not sent again. Send a test event, or wait for a new event.' });
        const made = engine.webhooks.redeliver(params.id ?? '');
        return made === undefined ? problemReply(404, { detail: `No delivery "${params.id ?? ''}" of an existing webhook.` }) : jsonReply(202, made);
      },
    },
  ];
}
