import type { AdminRoute } from './admin.ts';
import type { Engine } from './engine.ts';
import { maskTail } from './inbox.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import { PushError, type Platform } from './push.ts';

const REDACTED = '[REDACTED]';
const asObject = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** What the audit keeps of a credentials upload: the ids that are not secret, never the key or the service account. */
export function pushUploadAudit(body: unknown): unknown {
  const input = asObject(body);
  const keep = Object.fromEntries(['keyId', 'teamId', 'bundleId'].filter((name) => typeof input[name] === 'string').map((name) => [name, input[name]]));
  return { ...keep, credentials: REDACTED };
}

/** What the audit keeps of a test send: the device token is masked to its last four characters. */
export function pushSendAudit(body: unknown): unknown {
  const input = asObject(body);
  return { ...input, ...(typeof input.token === 'string' ? { token: maskTail(input.token) } : {}) };
}

const platformOf = (raw: string | undefined): Platform | undefined => (raw === 'fcm' || raw === 'apns' ? raw : undefined);

/**
 * Settings → Push: upload and delete the FCM service account and the APNs key (admin), send a test push, and the last
 * 50 sends. Nothing here ever returns a credential: only "configured" and the project or key ids.
 */
export function adminPushRoutes(engine: Engine): AdminRoute[] {
  const failure = (error: unknown): Reply => {
    if (error instanceof PushError) return problemReply(400, { detail: error.message });
    return problemReply(502, { detail: 'The push service could not be used.' });
  };
  return [
    { method: 'GET', pattern: '/push', handler: () => jsonReply(200, { ...engine.push.status(), history: engine.push.history() }) },
    {
      method: 'PUT',
      pattern: '/push/:platform',
      handler: (ctx, params) => {
        const platform = platformOf(params.platform);
        if (platform === undefined) return problemReply(404, { detail: 'Use fcm or apns.' });
        const parsed = readJson(ctx);
        if (!parsed.ok) return parsed.reply;
        try {
          if (platform === 'fcm') engine.push.setFcm(asObject(parsed.value).serviceAccount ?? parsed.value);
          else engine.push.setApns(parsed.value);
        } catch (error) {
          return failure(error);
        }
        return jsonReply(200, engine.push.status());
      },
    },
    {
      method: 'DELETE',
      pattern: '/push/:platform',
      handler: (_ctx, params) => {
        const platform = platformOf(params.platform);
        if (platform === undefined) return problemReply(404, { detail: 'Use fcm or apns.' });
        engine.push.remove(platform);
        return jsonReply(200, engine.push.status());
      },
    },
    {
      method: 'POST',
      pattern: '/push/send',
      handler: async (ctx) => {
        const parsed = readJson(ctx);
        if (!parsed.ok) return parsed.reply;
        const body = asObject(parsed.value);
        const platform = platformOf(typeof body.platform === 'string' ? body.platform : undefined);
        if (platform === undefined || typeof body.token !== 'string') return problemReply(400, { detail: 'Send { "platform": "fcm" | "apns", "token", "title", "body", "data", "sandbox" }.' });
        if (body.data !== undefined && (typeof body.data !== 'object' || body.data === null || Array.isArray(body.data))) return problemReply(400, { detail: 'data must be a JSON object.' });
        for (const name of ['title', 'body']) if (body[name] !== undefined && typeof body[name] !== 'string') return problemReply(400, { detail: `${name} must be text.` });
        try {
          const result = await engine.push.send({
            platform,
            token: body.token,
            ...(typeof body.title === 'string' ? { title: body.title } : {}),
            ...(typeof body.body === 'string' ? { body: body.body } : {}),
            ...(body.data === undefined ? {} : { data: body.data as Record<string, unknown> }),
            ...(body.sandbox === true ? { sandbox: true } : {}),
          });
          return jsonReply(200, result);
        } catch (error) {
          return failure(error);
        }
      },
    },
  ];
}
