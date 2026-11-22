import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from '../http.ts';
import type { AdminRoute } from '../admin.ts';
import type { Manager } from '../manager.ts';
import { DefinitionError } from '../schema.ts';

import { fetchApiFile } from './fetch-url.ts';
import { importApiText, type ImportedApi } from './openapi.ts';
import { applyImport, CHANGE_CHOICES, diffImport, type ChangeChoice, type ImportChoices } from './sync.ts';

export interface ImportRouteOptions {
  /** False on a team server: a URL that points at a private network is refused. */
  allowPrivate: boolean;
  now?: () => Date;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

function mapOf<T>(value: unknown, keep: (entry: unknown) => entry is T): Record<string, T> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) if (keep(entry)) out[key] = entry;
  return out;
}
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isChoice = (value: unknown): value is ChangeChoice => typeof value === 'string' && (CHANGE_CHOICES as readonly string[]).includes(value);

function choicesOf(value: unknown): ImportChoices {
  const raw = isObject(value) ? value : {};
  const add = mapOf(raw.add, isBoolean);
  const remove = mapOf(raw.remove, isBoolean);
  if (isObject(raw.change)) {
    for (const [id, choice] of Object.entries(raw.change)) {
      if (!isChoice(choice)) throw new DefinitionError(`"${String(choice)}" is not a choice for ${id}. Use take-new, keep-mine or merge.`);
    }
  }
  const change = mapOf(raw.change, isChoice);
  return { ...(add === undefined ? {} : { add }), ...(remove === undefined ? {} : { remove }), ...(change === undefined ? {} : { change }) };
}

/** Reads the file the request names: `text` (with a `name`, for the format and the record) or a `url` the engine downloads. */
async function load(body: Json, options: ImportRouteOptions): Promise<{ imported: ImportedApi; source: string }> {
  if (typeof body.url === 'string' && body.url !== '') {
    const got = await fetchApiFile(body.url, { allowPrivate: options.allowPrivate });
    // The record keeps the address without its query string, which may hold a token.
    const shown = new URL(got.url);
    return { imported: importApiText(got.text, shown.pathname), source: `${shown.origin}${shown.pathname}` };
  }
  if (typeof body.text !== 'string' || body.text === '') throw new DefinitionError('Send the file as "text" (with its "name"), or a "url".');
  const name = typeof body.name === 'string' && body.name !== '' ? body.name.slice(0, 200) : 'uploaded file';
  return { imported: importApiText(body.text, name), source: name };
}

const countByTag = (imported: ImportedApi): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const endpoint of imported.endpoints) {
    const tags = Array.isArray(endpoint.tags) && endpoint.tags.length > 0 ? (endpoint.tags as string[]) : ['untagged'];
    for (const tag of tags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
};

/** `POST /import/preview` (what would change, nothing is written) and `POST /import/apply` (with the user's choices). */
export function adminImportRoutes(manager: Manager, options: ImportRouteOptions): AdminRoute[] {
  const now = options.now ?? ((): Date => new Date());
  const withBody = async (ctx: RequestCtx, use: (body: Json) => Promise<Reply>): Promise<Reply> => {
    const parsed = readJson(ctx);
    if (!parsed.ok) return parsed.reply;
    return use(isObject(parsed.value) ? parsed.value : {});
  };
  return [
    {
      method: 'POST',
      pattern: '/import/preview',
      handler: (ctx) =>
        withBody(ctx, async (body) => {
          const { imported, source } = await load(body, options);
          const definition = manager.definition();
          return jsonReply(200, {
            source,
            format: imported.format,
            hash: imported.hash,
            title: imported.title ?? null,
            total: imported.endpoints.length,
            byTag: countByTag(imported),
            warnings: imported.warnings,
            firstImport: (definition.imports ?? []).length === 0 && (definition.endpoints ?? []).length === 0,
            diff: diffImport(definition, imported),
          });
        }),
    },
    {
      method: 'POST',
      pattern: '/import/apply',
      handler: (ctx) =>
        withBody(ctx, async (body) => {
          const { imported, source } = await load(body, options);
          if (typeof body.expectHash === 'string' && body.expectHash !== imported.hash) {
            return problemReply(409, { detail: 'The file changed since the preview. Preview it again.' });
          }
          const result = applyImport(manager.definition(), imported, source, choicesOf(body.choices), now());
          await manager.commit(result.definition);
          return jsonReply(200, { ok: true, source, hash: imported.hash, applied: result.applied, notes: result.notes, warnings: imported.warnings });
        }),
    },
  ];
}
