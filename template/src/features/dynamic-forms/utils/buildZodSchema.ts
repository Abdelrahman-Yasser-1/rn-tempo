import { get } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import type {
  JsonItemField,
  JsonLeafField,
  JsonRepeatField,
  JsonRule,
} from '@features/dynamic-forms/utils/jsonSchema';
import { VALIDATION_MESSAGES } from '@features/dynamic-forms/utils/messages';
import { PATTERNS } from '@features/dynamic-forms/utils/patterns';
import { isValidPhone } from '@shared/utils';

type Check = (value: unknown) => string | undefined;

const EMAIL = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

function isEmpty(type: string, value: unknown): boolean {
  if (type === 'checkbox' || type === 'switch') {
    return value !== true;
  }
  return typeof value === 'number'
    ? Number.isNaN(value)
    : value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
}

/** One rule as a function from a value to a message key, or `undefined` when the value passes. */
function ruleCheck(item: JsonRule): Check {
  const fallback = (key: string) => item.message ?? key;
  switch (item.rule) {
    case 'required':
      return () => fallback(VALIDATION_MESSAGES.required);
    case 'minLength':
      return (value) =>
        typeof value === 'string' && value.length < item.value
          ? fallback(VALIDATION_MESSAGES.tooShort)
          : undefined;
    case 'maxLength':
      return (value) =>
        typeof value === 'string' && value.length > item.value
          ? fallback(VALIDATION_MESSAGES.tooLong)
          : undefined;
    case 'min':
      return (value) =>
        typeof value === 'number' && value < item.value
          ? fallback(VALIDATION_MESSAGES.tooSmall)
          : undefined;
    case 'max':
      return (value) =>
        typeof value === 'number' && value > item.value
          ? fallback(VALIDATION_MESSAGES.tooBig)
          : undefined;
    case 'email':
      return (value) =>
        typeof value === 'string' && !EMAIL.test(value)
          ? fallback(VALIDATION_MESSAGES.email)
          : undefined;
    case 'phone':
      return (value) =>
        typeof value === 'string' && !isValidPhone(value)
          ? fallback(VALIDATION_MESSAGES.phone)
          : undefined;
    case 'pattern': {
      const pattern = PATTERNS[item.name];
      return (value) =>
        typeof value === 'string' && !pattern.regex.test(value)
          ? fallback(pattern.message)
          : undefined;
    }
    case 'minItems':
      return (value) =>
        Array.isArray(value) && value.length < item.value
          ? fallback(VALIDATION_MESSAGES.tooFewItems)
          : undefined;
    case 'maxItems':
      return (value) =>
        Array.isArray(value) && value.length > item.value
          ? fallback(VALIDATION_MESSAGES.tooManyItems)
          : undefined;
  }
}

/**
 * The check of a field: `required` first, and an empty optional value skips every other rule.
 * Returns the message key of the first rule that fails.
 */
function fieldCheck(type: string, rules: readonly JsonRule[] = []): Check {
  const required = rules.find((item) => item.rule === 'required');
  const others = rules.filter((item) => item.rule !== 'required').map(ruleCheck);
  const requiredCheck = required ? ruleCheck(required) : undefined;
  const isList = type === 'repeat' || type === 'multiSelect';
  return (input) => {
    const value = isList && input === undefined ? [] : input;
    if (isEmpty(type, value)) {
      const message = requiredCheck?.(value);
      // An empty list still answers to minItems; any other empty value skips the other rules.
      if (message !== undefined || !Array.isArray(value)) {
        return message;
      }
    }
    for (const check of others) {
      const message = check(value);
      if (message !== undefined) {
        return message;
      }
    }
  };
}

function leafSchema(field: JsonLeafField): z.ZodType {
  const check = fieldCheck(field.type, field.rules);
  return z
    .unknown()
    .optional()
    .superRefine((value, ctx) => {
      const message = check(value);
      if (message !== undefined) {
        ctx.addIssue({ code: 'custom', message });
      }
    });
}

function repeatSchema(field: JsonRepeatField): z.ZodType {
  const listCheck = fieldCheck('repeat', field.rules);
  const itemChecks = field.fields.map((child: JsonItemField) => ({
    name: child.name,
    check: fieldCheck(child.type, child.rules),
  }));
  return z
    .unknown()
    .optional()
    .superRefine((value, ctx) => {
      const list: unknown[] = Array.isArray(value) ? value : [];
      const message = listCheck(list);
      if (message !== undefined) {
        ctx.addIssue({ code: 'custom', message });
      }
      for (const [index, item] of list.entries()) {
        for (const { name, check } of itemChecks) {
          const itemMessage = check(get(item, name));
          if (itemMessage !== undefined) {
            ctx.addIssue({ code: 'custom', message: itemMessage, path: [index, name] });
          }
        }
      }
    });
}

/**
 * Builds the Zod schema of a document from its rules. It validates every field, visible or not:
 * the builders drop the errors of hidden fields (see `createFormResolver`), the same way they do
 * for a hand-written schema. Messages are keys of the `forms` namespace unless a rule names one.
 */
export function buildZodSchema(
  fields: readonly (JsonLeafField | JsonRepeatField)[],
): z.ZodType<Record<string, unknown>, FieldValues> {
  const shape = Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === 'repeat' ? repeatSchema(field) : leafSchema(field),
    ]),
  );
  return z.object(shape);
}
