import { buildSchema, GraphQLError, type GraphQLSchema } from 'graphql';

import type { Collection, Field } from './schema.ts';

/** The part of a backend definition a schema is built from. */
export interface DefinitionLike {
  collections: readonly Collection[];
}

/**
 * The schema of a `graphql` endpoint, and what answers each of its fields.
 *
 * From collections it is generated: for a collection `products` a type `Product`, the inputs `ProductWhere`, `ProductInput`
 * and `ProductPatch`, `Query.products(limit, skip, where, sort)` and `Query.productsById(id)`, `Mutation.createProduct`,
 * `updateProduct` and `deleteProduct`, and `Subscription.productsCreated`, `productsUpdated` and `productsDeleted` (fed by the
 * data change events). From SDL it is exactly what the file says; a field is answered by a resolver the endpoint names
 * (a collection, a fixed value with placeholders, a handler file, or an event) and is null otherwise.
 */

export type CollectionAction = 'list' | 'get' | 'create' | 'update' | 'delete';

export type ResolverSpec =
  | { kind: 'collection'; collection: string; action: CollectionAction }
  | { kind: 'static'; value: unknown }
  | { kind: 'handler'; file: string }
  | { kind: 'event'; event: string };

/** What an endpoint's `schema` and `resolvers` settings hold (the parts this module reads). */
export interface GraphqlSource {
  schema: { source: 'collections' | 'sdl'; sdl?: string | undefined; collections?: string[] | undefined; hiddenFields?: string[] | undefined };
  resolvers: Record<string, { collection?: string; action?: CollectionAction; static?: unknown; handler?: string; event?: string }>;
}

export interface GraphqlModel {
  schema: GraphQLSchema;
  sdl: string;
  /** `Type.field` to what answers it. */
  resolvers: Map<string, ResolverSpec>;
}

export class GraphqlSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphqlSchemaError';
  }
}

const NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;
const SCALARS: Readonly<Record<Field['type'], string>> = { string: 'String', number: 'Float', boolean: 'Boolean', date: 'String', enum: 'String', json: 'JSON', relation: 'Int', media: 'String' };

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** `products` is `Product`, `categories` is `Category`, `order_items` is `OrderItem`. */
export function typeNameOf(collection: string): string {
  const words = collection.split('_').filter((word) => word !== '');
  const last = words.pop() ?? collection;
  const singular = /ies$/.test(last) && last.length > 3 ? `${last.slice(0, -3)}y` : /(ss|us|is)$/.test(last) || !/s$/.test(last) ? last : last.slice(0, -1);
  return [...words, singular].map(capital).join('');
}

/** The input text of a field's GraphQL type, or `undefined` when the field cannot be filtered on (json). */
function scalarOf(collection: Collection, field: Field, enums: string[]): string {
  if (field.type === 'enum' && field.enumValues !== undefined && field.enumValues.every((value) => NAME.test(value) && !['true', 'false', 'null'].includes(value))) {
    const name = `${typeNameOf(collection.name)}${field.name.split('_').map(capital).join('')}`;
    if (!enums.some((entry) => entry.startsWith(`enum ${name} `))) enums.push(`enum ${name} { ${field.enumValues.join(' ')} }`);
    return name;
  }
  return SCALARS[field.type];
}

/** The SDL generated for the collections an endpoint exposes, and the resolvers that answer it. */
export function generateFromCollections(definition: DefinitionLike, source: GraphqlSource, hiddenByCrud: ReadonlyMap<string, ReadonlySet<string>>): { sdl: string; resolvers: Map<string, ResolverSpec> } {
  const wanted = source.schema.collections;
  const chosen = definition.collections.filter((collection) => wanted === undefined || wanted.length === 0 || wanted.includes(collection.name));
  for (const name of wanted ?? []) if (!definition.collections.some((collection) => collection.name === name)) throw new GraphqlSchemaError(`Unknown collection "${name}".`);
  const hidden = new Set(source.schema.hiddenFields ?? []);
  const resolvers = new Map<string, ResolverSpec>();
  const blocks: string[] = ['scalar JSON'];
  const enums: string[] = [];
  const query: string[] = [];
  const mutation: string[] = [];
  const subscription: string[] = [];
  const seen = new Map<string, string>();
  for (const collection of chosen) {
    const type = typeNameOf(collection.name);
    const clash = seen.get(type);
    if (clash !== undefined) throw new GraphqlSchemaError(`Collections "${clash}" and "${collection.name}" would both become the type ${type}.`);
    seen.set(type, collection.name);
    const visible = collection.fields.filter((field) => !hidden.has(`${collection.name}.${field.name}`) && !(hiddenByCrud.get(collection.name)?.has(field.name) ?? false));
    const out = [`  id: Int!`, ...visible.map((field) => `  ${field.name}: ${scalarOf(collection, field, enums)}${field.required ? '!' : ''}`)];
    blocks.push(`type ${type} {\n${out.join('\n')}\n}`);
    const filterable = visible.filter((field) => field.type !== 'json');
    blocks.push(`input ${type}Where {\n${['  id: Int', ...filterable.map((field) => `  ${field.name}: ${scalarOf(collection, field, enums)}`)].join('\n')}\n}`);
    const inputs = collection.fields.map((field) => `  ${field.name}: ${scalarOf(collection, field, enums)}${field.required && field.default === undefined ? '!' : ''}`);
    blocks.push(`input ${type}Input {\n${inputs.join('\n')}\n}`);
    blocks.push(`input ${type}Patch {\n${collection.fields.map((field) => `  ${field.name}: ${scalarOf(collection, field, enums)}`).join('\n')}\n}`);
    const name = collection.name;
    query.push(`  ${name}(limit: Int, skip: Int, where: ${type}Where, sort: String): [${type}!]!`, `  ${name}ById(id: Int!): ${type}`);
    resolvers.set(`Query.${name}`, { kind: 'collection', collection: name, action: 'list' });
    resolvers.set(`Query.${name}ById`, { kind: 'collection', collection: name, action: 'get' });
    mutation.push(`  create${type}(input: ${type}Input!): ${type}!`, `  update${type}(id: Int!, input: ${type}Patch!): ${type}`, `  delete${type}(id: Int!): ${type}`);
    resolvers.set(`Mutation.create${type}`, { kind: 'collection', collection: name, action: 'create' });
    resolvers.set(`Mutation.update${type}`, { kind: 'collection', collection: name, action: 'update' });
    resolvers.set(`Mutation.delete${type}`, { kind: 'collection', collection: name, action: 'delete' });
    for (const [suffix, action] of [['Created', 'created'], ['Updated', 'updated'], ['Deleted', 'deleted']] as const) {
      subscription.push(`  ${name}${suffix}: ${type}!`);
      resolvers.set(`Subscription.${name}${suffix}`, { kind: 'event', event: `${name}.${action}` });
    }
  }
  blocks.push(...enums);
  // An empty root type is not valid SDL, so each is written only when it has fields (a backend with no collection still gets a Query).
  const roots: string[] = [`type Query {\n${query.length === 0 ? '  _empty: Boolean' : query.join('\n')}\n}`];
  if (mutation.length > 0) roots.push(`type Mutation {\n${mutation.join('\n')}\n}`);
  if (subscription.length > 0) roots.push(`type Subscription {\n${subscription.join('\n')}\n}`);
  return { sdl: `${blocks.join('\n\n')}\n\n${roots.join('\n\n')}\n`, resolvers };
}

/** The resolver a definition names for a field. */
function specOf(key: string, raw: GraphqlSource['resolvers'][string]): ResolverSpec {
  if (raw.collection !== undefined) {
    if (raw.action === undefined) throw new GraphqlSchemaError(`Resolver "${key}" names a collection but no action (list, get, create, update or delete).`);
    return { kind: 'collection', collection: raw.collection, action: raw.action };
  }
  if (raw.handler !== undefined) return { kind: 'handler', file: raw.handler };
  if (raw.event !== undefined) return { kind: 'event', event: raw.event };
  return { kind: 'static', value: raw.static };
}

/**
 * Builds the schema and the resolver table of an endpoint. With `source: "collections"` the SDL of the collections comes
 * first and an optional `sdl` extends it (`extend type Query { hello: String }`); with `source: "sdl"` it is the whole schema.
 */
export function buildGraphqlModel(definition: DefinitionLike, source: GraphqlSource, hiddenByCrud: ReadonlyMap<string, ReadonlySet<string>> = new Map()): GraphqlModel {
  let sdl: string;
  let resolvers = new Map<string, ResolverSpec>();
  if (source.schema.source === 'collections') {
    const generated = generateFromCollections(definition, source, hiddenByCrud);
    resolvers = generated.resolvers;
    sdl = source.schema.sdl === undefined || source.schema.sdl.trim() === '' ? generated.sdl : `${generated.sdl}\n${source.schema.sdl}`;
  } else {
    if (source.schema.sdl === undefined || source.schema.sdl.trim() === '') throw new GraphqlSchemaError('Write the schema in `schema.sdl`.');
    sdl = source.schema.sdl;
  }
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch (error) {
    throw new GraphqlSchemaError(error instanceof GraphQLError ? error.message : error instanceof Error ? error.message : 'The schema is not valid.');
  }
  for (const [key, raw] of Object.entries(source.resolvers)) {
    const [typeName = '', fieldName = ''] = key.split('.');
    const type = schema.getType(typeName);
    const field = type !== undefined && 'getFields' in type ? (type as { getFields(): Record<string, unknown> }).getFields()[fieldName] : undefined;
    if (field === undefined) throw new GraphqlSchemaError(`Resolver "${key}" does not match a field of the schema.`);
    const spec = specOf(key, raw);
    if (spec.kind === 'collection' && !definition.collections.some((collection) => collection.name === spec.collection)) throw new GraphqlSchemaError(`Resolver "${key}" names the unknown collection "${spec.collection}".`);
    resolvers.set(key, spec);
  }
  return { schema, sdl, resolvers };
}
