import type { JsonSchema } from '../api/types';

/** One line of the readable view of a JSON Schema. */
export interface SchemaNode {
  /** The property name, `[item]` for array items, or empty for the root. */
  name: string;
  /** `string`, `integer`, `object`, `string | null`, `one of`... */
  type: string;
  required: boolean;
  /** Short facts: `email`, `1 to 50 characters`, `one of: a, b`. */
  notes: string[];
  children: SchemaNode[];
}

const isObject = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value);
const MAX_DEPTH = 8;

function typeText(schema: JsonSchema): string {
  if (Array.isArray(schema.type)) return schema.type.filter((entry): entry is string => typeof entry === 'string').join(' | ');
  if (typeof schema.type === 'string') return schema.type;
  if ('const' in schema) return 'constant';
  if (Array.isArray(schema.oneOf)) return 'one of';
  if (Array.isArray(schema.anyOf)) return 'any of';
  if (Array.isArray(schema.allOf)) return 'all of';
  if (isObject(schema.properties)) return 'object';
  return 'any';
}

function notesOf(schema: JsonSchema): string[] {
  const notes: string[] = [];
  if (typeof schema.format === 'string') notes.push(schema.format);
  if (Array.isArray(schema.enum)) notes.push(`one of: ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
  if ('const' in schema) notes.push(`always ${JSON.stringify(schema.const)}`);
  const range = (low: unknown, high: unknown, unit: string): void => {
    if (typeof low === 'number' && typeof high === 'number') notes.push(`${String(low)} to ${String(high)}${unit}`);
    else if (typeof low === 'number') notes.push(`at least ${String(low)}${unit}`);
    else if (typeof high === 'number') notes.push(`at most ${String(high)}${unit}`);
  };
  range(schema.minLength, schema.maxLength, ' characters');
  range(schema.minimum, schema.maximum, '');
  range(schema.minItems, schema.maxItems, ' items');
  if (typeof schema.description === 'string' && schema.description !== '') notes.push(schema.description);
  return notes;
}

/** The schema as a tree a person can read: names, types, what is required and the limits. Deep schemas are cut. */
export function schemaTree(schema: unknown, name = '', required = false, depth = 0): SchemaNode {
  if (!isObject(schema)) return { name, type: 'any', required, notes: [], children: [] };
  const node: SchemaNode = { name, type: typeText(schema), required, notes: notesOf(schema), children: [] };
  if (depth >= MAX_DEPTH) return node;
  if (isObject(schema.properties)) {
    const need = new Set(Array.isArray(schema.required) ? schema.required.filter((entry): entry is string => typeof entry === 'string') : []);
    node.children = Object.entries(schema.properties).map(([key, child]) => schemaTree(child, key, need.has(key), depth + 1));
  }
  if (schema.items !== undefined) node.children.push(schemaTree(schema.items, '[item]', false, depth + 1));
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const options = schema[key];
    if (Array.isArray(options)) options.forEach((option, index) => node.children.push(schemaTree(option, `option ${String(index + 1)}`, false, depth + 1)));
  }
  return node;
}
