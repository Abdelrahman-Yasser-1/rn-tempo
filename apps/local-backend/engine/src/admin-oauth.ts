import type { AdminRoute } from './admin.ts';
import type { Engine } from './engine.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import type { Manager, RawDefinition } from './manager.ts';
import { DefinitionError, issuesFromZod, OauthSchema } from './schema.ts';

/**
 * Settings → OAuth: the mock provider's clients and the addresses to paste into an app. Changing the configuration or a
 * client secret is an admin's. A client secret is shown once when it is made; no route reads it back.
 */
export function adminOauthRoutes(engine: Engine, manager: Manager, errorReply: (error: unknown) => Reply): AdminRoute[] {
  const view = (): Record<string, unknown> => {
    const oauth = engine.definition.oauth ?? { enabled: false, provider: 'google', clients: [] };
    const origin = engine.publicPrefix === '' ? `${engine.definition.https ? 'https' : 'http'}://localhost:${String(engine.definition.port)}` : '';
    return { ...oauth, clients: oauth.clients.map((client) => ({ ...client, secretConfigured: engine.oauth.hasSecret(client.clientId) })), endpoints: engine.oauth.endpoints(origin) };
  };
  const known = (id: string | undefined): boolean => (engine.definition.oauth?.clients ?? []).some((client) => client.clientId === id);
  return [
    { method: 'GET', pattern: '/oauth', handler: () => jsonReply(200, view()) },
    {
      method: 'PUT',
      pattern: '/oauth',
      handler: async (ctx) => {
        const body = readJson(ctx);
        if (!body.ok) return body.reply;
        const parsed = OauthSchema.safeParse(body.value);
        if (!parsed.success) return errorReply(new DefinitionError('The OAuth settings are not valid:', issuesFromZod(parsed.error)));
        try {
          await manager.edit((draft: RawDefinition) => {
            (draft as Record<string, unknown>).oauth = body.value;
          });
        } catch (error) {
          return errorReply(error);
        }
        return jsonReply(200, view());
      },
    },
    {
      method: 'POST',
      pattern: '/oauth/clients/:clientId/secret',
      handler: (_ctx, params) => (known(params.clientId) ? jsonReply(200, { clientId: params.clientId, secret: engine.oauth.rotateSecret(params.clientId ?? '') }) : problemReply(404, { detail: `No client "${params.clientId ?? ''}".` })),
    },
    {
      method: 'DELETE',
      pattern: '/oauth/clients/:clientId/secret',
      handler: (_ctx, params) => {
        if (!known(params.clientId)) return problemReply(404, { detail: `No client "${params.clientId ?? ''}".` });
        engine.oauth.removeSecret(params.clientId ?? '');
        return jsonReply(200, { ok: true });
      },
    },
  ];
}
