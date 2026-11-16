import { z } from 'zod';

import { defineEndpoint } from './endpoint.ts';
import { ApiError } from './problem.ts';
import type { EndpointDefinition, ResourceBinding } from './types.ts';

export interface ResourceOptions {
  /** A count of items to generate from the schema, or the items themselves. Defaults to 20. */
  seed?: number | readonly Record<string, unknown>[];
  /** Fields that `?q=` searches, matched case-insensitively. */
  searchBy?: readonly string[];
  /** The field that identifies an item. Defaults to `id`. */
  idField?: string;
  /** Request body of create. Defaults to the item schema without its id. */
  createSchema?: z.ZodType;
  /** Request body of update. Defaults to the create schema with every field optional. */
  updateSchema?: z.ZodType;
  /** Key that holds the items in the list response. Defaults to the resource name. */
  listKey?: string;
  /** Path prefix. Defaults to `/<name>`. */
  path?: string;
  tags?: readonly string[];
}

/** The five endpoints of a resource, also reachable by name. */
export type ResourceEndpoints = readonly EndpointDefinition[] & {
  readonly list: EndpointDefinition;
  readonly get: EndpointDefinition;
  readonly create: EndpointDefinition;
  readonly update: EndpointDefinition;
  readonly delete: EndpointDefinition;
};

const DEFAULT_LIMIT = 30;

/**
 * Expands one item schema into list, get, create, update and delete endpoints.
 *
 * List follows dummyjson: `?limit=&skip=` and `?q=`, answering
 * `{ <listKey>: Item[], total, skip, limit }`. A `limit` of 0 returns every item. The endpoints
 * read and write the collection called `name` through `ctx.db`, so a server only has to provide
 * a store; the same definitions can run on a real database.
 */
export function resource<S extends z.ZodObject>(
  name: string,
  itemSchema: S,
  options: ResourceOptions = {},
): ResourceEndpoints {
  const idField = options.idField ?? 'id';
  const searchBy = options.searchBy ?? [];
  const listKey = options.listKey ?? name;
  const base = options.path ?? `/${name}`;
  const tags = options.tags ?? [name];

  const shape = itemSchema.shape as Record<string, z.ZodType>;
  if (!(idField in shape)) {
    throw new Error(`resource("${name}"): the schema has no "${idField}" field`);
  }
  for (const field of searchBy) {
    if (!(field in shape)) throw new Error(`resource("${name}"): searchBy field "${field}" is not in the schema`);
  }

  const createSchema =
    options.createSchema ?? itemSchema.omit({ [idField]: true } as Record<string, true>);
  const updateSchema =
    options.updateSchema ??
    (createSchema instanceof z.ZodObject ? createSchema.partial() : createSchema);

  const binding = (op: ResourceBinding['op']): ResourceBinding => ({
    name,
    op,
    idField,
    schema: itemSchema,
    seed: options.seed ?? 20,
    searchBy,
  });

  const params = z.object({ id: z.string() });
  const notFound = (id: string): ApiError => new ApiError(404, `${name} ${id} was not found.`);

  const list = defineEndpoint({
    id: `list.${name}`,
    method: 'GET',
    path: base,
    summary: `List ${name}`,
    tags,
    query: z.object({
      limit: z.coerce.number().int().min(0).default(DEFAULT_LIMIT),
      skip: z.coerce.number().int().min(0).default(0),
      q: z.string().optional(),
    }),
    response: z.object({
      [listKey]: z.array(itemSchema),
      total: z.number().int(),
      skip: z.number().int(),
      limit: z.number().int(),
    }),
    resource: binding('list'),
    data: ({ query, db }) => {
      const needle = query.q?.trim().toLowerCase();
      const all = db.collection(name).list<Record<string, unknown> & z.input<S>>();
      const matches =
        needle === undefined || needle === '' || searchBy.length === 0
          ? all
          : all.filter((item) =>
              searchBy.some((field) => String(item[field] ?? '').toLowerCase().includes(needle)),
            );
      const page = query.limit === 0 ? matches.slice(query.skip) : matches.slice(query.skip, query.skip + query.limit);
      return { [listKey]: page as z.input<S>[], total: matches.length, skip: query.skip, limit: query.limit };
    },
  });

  const get = defineEndpoint({
    id: `get.${name}`,
    method: 'GET',
    path: `${base}/:id`,
    summary: `Get one of ${name}`,
    tags,
    params,
    response: itemSchema,
    resource: binding('get'),
    data: ({ params: { id }, db }) => {
      const item = db.collection(name).get<z.input<S>>(id);
      if (item === undefined) throw notFound(id);
      return item;
    },
  });

  const create = defineEndpoint({
    id: `create.${name}`,
    method: 'POST',
    path: `${base}/add`,
    summary: `Create one of ${name}`,
    tags,
    body: createSchema,
    response: itemSchema,
    status: 201,
    resource: binding('create'),
    data: ({ body, db }) => db.collection(name).create<z.input<S>>(body as Record<string, unknown>),
  });

  const update = defineEndpoint({
    id: `update.${name}`,
    method: 'PATCH',
    path: `${base}/:id`,
    summary: `Update one of ${name}`,
    tags,
    params,
    body: updateSchema,
    response: itemSchema,
    resource: binding('update'),
    data: ({ params: { id }, body, db }) => {
      const item = db.collection(name).update<z.input<S>>(id, body as Record<string, unknown>);
      if (item === undefined) throw notFound(id);
      return item;
    },
  });

  const remove = defineEndpoint({
    id: `delete.${name}`,
    method: 'DELETE',
    path: `${base}/:id`,
    summary: `Delete one of ${name}`,
    tags,
    params,
    response: itemSchema,
    resource: binding('delete'),
    data: ({ params: { id }, db }) => {
      const item = db.collection(name).remove<z.input<S>>(id);
      if (item === undefined) throw notFound(id);
      return item;
    },
  });

  return Object.assign([list, get, create, update, remove] as const, {
    list,
    get,
    create,
    update,
    delete: remove,
  }) as unknown as ResourceEndpoints;
}
