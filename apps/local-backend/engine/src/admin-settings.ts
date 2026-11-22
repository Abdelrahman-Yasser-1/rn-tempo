import type { AdminRoute } from './admin.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import type { Manager, RawDefinition } from './manager.ts';

/** The keys of `backend.json` each settings page owns. A PUT replaces all of them: a key left out is removed. */
export const SETTINGS_PAGES = {
  network: ['network', 'latency', 'testMode'],
  responses: ['responses', 'responseTemplates'],
  faults: ['faults', 'cors'],
} as const;
type Page = keyof typeof SETTINGS_PAGES;

const asObject = (value: unknown): Record<string, unknown> | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

/**
 * Admin routes for Settings → Network and Settings → Responses. They read and write the same `backend.json` keys the
 * definition holds, but through a route of their own so the role table can ask for the admin role and the audit log
 * names the page that changed (`PUT /settings/network`).
 */
export function adminSettingsRoutes(manager: Manager, errorReply: (error: unknown) => Reply): AdminRoute[] {
  const read = (page: Page): Reply => {
    const definition = manager.definition() as Record<string, unknown>;
    return jsonReply(200, Object.fromEntries(SETTINGS_PAGES[page].filter((key) => definition[key] !== undefined).map((key) => [key, definition[key]])));
  };
  const write = (page: Page): AdminRoute['handler'] => async (ctx) => {
    const parsed = readJson(ctx);
    if (!parsed.ok) return parsed.reply;
    const body = asObject(parsed.value);
    if (body === undefined) return problemReply(400, { detail: 'Send a JSON object.' });
    const keys: readonly string[] = SETTINGS_PAGES[page];
    const unknown = Object.keys(body).find((key) => !keys.includes(key));
    if (unknown !== undefined) return problemReply(400, { detail: `"${unknown}" is not a ${page} setting. Use ${keys.join(', ')}.` });
    try {
      await manager.edit((draft: RawDefinition) => {
        const target = draft as Record<string, unknown>;
        for (const key of keys) {
          if (body[key] === undefined) delete target[key];
          else target[key] = body[key];
        }
      });
      return read(page);
    } catch (error) {
      return errorReply(error);
    }
  };
  return (Object.keys(SETTINGS_PAGES) as Page[]).flatMap((page) => [
    { method: 'GET', pattern: `/settings/${page}`, handler: () => read(page) },
    { method: 'PUT', pattern: `/settings/${page}`, handler: write(page) },
  ]);
}
