import { z } from 'zod';

import type { FieldTypeName } from '@features/dynamic-forms/components/FieldRegistry';
import { conditionSchema } from '@features/dynamic-forms/utils/conditions';
import { PATTERN_NAMES } from '@features/dynamic-forms/utils/patterns';

/**
 * The server-driven form format, as a Zod schema. The document is untrusted: every object is
 * strict (unknown keys are rejected, so there is no place for code), sizes are capped, names are
 * plain identifiers, and the only functions in a form are the ones the app already has.
 */

export const JSON_FORM_VERSION = 1;
/**
 * Caps on a server document. The first group is checked by `preCheckJson` on the raw input,
 * iteratively, before any schema runs; the rest are enforced by the schema.
 */
export const JSON_LIMITS = {
  /** Deepest nesting of objects and arrays anywhere in the document. */
  depth: 24,
  /** Total number of values (objects, arrays, strings, numbers, ...) in the document. */
  nodes: 5000,
  /** Longest array (fields, steps, options, rules ...). */
  arrayLength: 200,
  /** Longest string, and longest object key. */
  stringLength: 2000,
  fields: 100,
  steps: 20,
  options: 200,
  rules: 10,
  text: 500,
} as const;

/** Field types a document may use. File and map fields are code-only. */
export const JSON_FIELD_TYPES = [
  'text',
  'textArea',
  'number',
  'select',
  'multiSelect',
  'radioGroup',
  'checkbox',
  'switch',
  'slider',
  'date',
  'time',
  'monthYear',
  'timeSlot',
  'otp',
  'phone',
] as const satisfies readonly FieldTypeName[];

const OPTION_TYPES: ReadonlySet<string> = new Set([
  'select',
  'multiSelect',
  'radioGroup',
  'timeSlot',
]);
const STRING_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textArea',
  'select',
  'radioGroup',
  'date',
  'time',
  'monthYear',
  'timeSlot',
  'otp',
  'phone',
]);
const NUMBER_TYPES: ReadonlySet<string> = new Set(['number', 'slider']);
const FREE_TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'textArea']);

/** Which rules a field type accepts. */
export function acceptsOptions(type: string): boolean {
  return OPTION_TYPES.has(type);
}
const RULE_TYPES: Record<string, (type: string) => boolean> = {
  required: () => true,
  minLength: (type) => STRING_TYPES.has(type),
  maxLength: (type) => STRING_TYPES.has(type),
  pattern: (type) => STRING_TYPES.has(type),
  phone: (type) => type === 'phone' || FREE_TEXT_TYPES.has(type),
  email: (type) => FREE_TEXT_TYPES.has(type),
  min: (type) => NUMBER_TYPES.has(type),
  max: (type) => NUMBER_TYPES.has(type),
  minItems: (type) => type === 'multiSelect' || type === 'repeat',
  maxItems: (type) => type === 'multiSelect' || type === 'repeat',
};

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
]);
const name = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{0,39}$/)
  .refine((value) => !RESERVED_NAMES.has(value));
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const key = z.string().regex(/^([a-z][A-Za-z0-9]*:)?[A-Za-z][\w.]{0,99}$/);
const text = z.union([
  key,
  z.strictObject({ en: z.string().max(JSON_LIMITS.text), ar: z.string().max(JSON_LIMITS.text) }),
]);
const count = z.number().int().min(0).max(1000);
const message = key.optional();

const rule = z.discriminatedUnion('rule', [
  z.strictObject({ rule: z.literal('required'), message }),
  z.strictObject({ rule: z.literal('minLength'), value: count, message }),
  z.strictObject({ rule: z.literal('maxLength'), value: count, message }),
  z.strictObject({ rule: z.literal('min'), value: z.number(), message }),
  z.strictObject({ rule: z.literal('max'), value: z.number(), message }),
  z.strictObject({ rule: z.literal('email'), message }),
  z.strictObject({ rule: z.literal('phone'), message }),
  z.strictObject({ rule: z.literal('pattern'), name: z.enum(PATTERN_NAMES), message }),
  z.strictObject({ rule: z.literal('minItems'), value: count, message }),
  z.strictObject({ rule: z.literal('maxItems'), value: count, message }),
]);
export type JsonRule = z.infer<typeof rule>;

const option = z.strictObject({
  value: z.string().min(1).max(100),
  label: text,
  disabled: z.boolean().optional(),
});

/** Props a document may set per field type, with the kind of value each takes. */
const PROP_KINDS: Record<string, Record<string, z.ZodType>> = {
  text: {
    keyboardType: z.enum(['default', 'email-address', 'numeric', 'phone-pad', 'url']),
    autoCapitalize: z.enum(['none', 'sentences', 'words', 'characters']),
    secureTextEntry: z.boolean(),
    maxLength: count,
  },
  textArea: { maxLength: count },
  number: { min: z.number(), max: z.number(), step: z.number() },
  slider: { min: z.number(), max: z.number(), step: z.number(), showValue: z.boolean() },
  select: { searchable: z.boolean() },
  multiSelect: { searchable: z.boolean(), maxSelected: count },
  date: { minDate: z.iso.date(), maxDate: z.iso.date() },
  monthYear: {
    minMonth: z.string().regex(/^\d{4}-\d{2}$/),
    maxMonth: z.string().regex(/^\d{4}-\d{2}$/),
  },
  time: { minuteInterval: z.number().int().min(1).max(30) },
  otp: { length: z.number().int().min(4).max(8) },
  phone: { defaultCountry: z.string().regex(/^[A-Z]{2}$/i) },
};

/** Props rules, as a plain check of the allowed keys and value kinds. */
export function propsAreAllowed(type: string, props: Readonly<Record<string, unknown>>): boolean {
  const kinds = PROP_KINDS[type] ?? {};
  return Object.entries(props).every(([propKey, propValue]) => {
    const kind = Object.hasOwn(kinds, propKey) ? kinds[propKey] : undefined;
    return kind?.safeParse(propValue).success === true;
  });
}

const defaultValue = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.array(z.string().max(100)).max(50),
]);

const common = {
  name,
  label: text.optional(),
  placeholder: text.optional(),
  helperText: text.optional(),
  subLabel: text.optional(),
  tooltip: text.optional(),
  options: z.array(option).max(JSON_LIMITS.options).optional(),
  props: z.record(z.string(), z.union([z.string().max(100), z.number(), z.boolean()])).optional(),
  rules: z.array(rule).max(JSON_LIMITS.rules).optional(),
  defaultValue: defaultValue.optional(),
  sensitive: z.boolean().optional(),
};

const behaviors = {
  visibleIf: conditionSchema.optional(),
  disabledIf: conditionSchema.optional(),
  clearOnHidden: z.boolean().optional(),
  resetOnChange: z.array(name).max(20).optional(),
};

function checkField(
  field: { type: string; options?: unknown[]; props?: Record<string, unknown>; rules?: JsonRule[] },
  ctx: z.RefinementCtx,
): void {
  const fail = (reason: string) => {
    ctx.addIssue({ code: 'custom', message: reason });
  };
  if (acceptsOptions(field.type) !== (field.options !== undefined)) {
    fail('options belong to select, multiSelect, radioGroup and timeSlot fields, and only to them');
  }
  if (field.props && !propsAreAllowed(field.type, field.props)) {
    fail('props has a key or a value that is not allowed for this field type');
  }
  if (
    field.type === 'slider' &&
    (field.props?.min === undefined || field.props.max === undefined)
  ) {
    fail('a slider needs props.min and props.max');
  }
  for (const item of field.rules ?? []) {
    if (!RULE_TYPES[item.rule]?.(field.type)) {
      fail(`rule ${item.rule} does not apply to ${field.type}`);
    }
  }
}

const leafField = z
  .strictObject({ type: z.enum(JSON_FIELD_TYPES), ...common, ...behaviors })
  .superRefine(checkField);
export type JsonLeafField = z.infer<typeof leafField>;

const itemField = z
  .strictObject({ type: z.enum(JSON_FIELD_TYPES), ...common })
  .superRefine(checkField);
export type JsonItemField = z.infer<typeof itemField>;

const repeatField = z
  .strictObject({
    type: z.literal('repeat'),
    name,
    label: text.optional(),
    itemLabel: text.optional(),
    addLabel: text.optional(),
    fields: z.array(itemField).min(1).max(20),
    rules: z.array(rule).max(JSON_LIMITS.rules).optional(),
    visibleIf: conditionSchema.optional(),
    disabledIf: conditionSchema.optional(),
  })
  .superRefine((field, ctx) => {
    for (const item of field.rules ?? []) {
      if (!RULE_TYPES[item.rule]?.('repeat')) {
        ctx.addIssue({ code: 'custom', message: `rule ${item.rule} does not apply to repeat` });
      }
    }
  });
export type JsonRepeatField = z.infer<typeof repeatField>;

const row = z.strictObject({
  type: z.literal('row'),
  fields: z.array(leafField).min(1).max(4),
  flex: z.array(z.number().min(1).max(12)).max(4).optional(),
  visibleIf: conditionSchema.optional(),
  disabledIf: conditionSchema.optional(),
});

const group = z.strictObject({
  type: z.literal('group'),
  fields: z
    .array(z.union([leafField, repeatField, row]))
    .min(1)
    .max(JSON_LIMITS.fields),
  visibleIf: conditionSchema.optional(),
  disabledIf: conditionSchema.optional(),
});

export const node = z.union([leafField, repeatField, row, group]);
export type JsonNode = z.infer<typeof node>;

export const step = z.strictObject({
  id,
  title: text.optional(),
  visibleIf: conditionSchema.optional(),
  canGoBack: z.boolean().optional(),
  fields: z.array(node).min(1).max(JSON_LIMITS.fields),
});

export const header = { version: z.literal(JSON_FORM_VERSION), id, draft: z.boolean().optional() };
