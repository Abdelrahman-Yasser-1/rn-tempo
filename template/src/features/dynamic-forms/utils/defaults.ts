import { get, set } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';

import type { FormField } from '@features/dynamic-forms/types';

import { getValueFields } from './fieldTree';

/**
 * What a field holds before the user touches it: `''` for text-like fields, `false` for
 * checkbox and switch, `[]` for lists, `undefined` for the rest. Strings are `''` (not
 * `undefined`) so a schema's `min(1)` reports "required" instead of a type error.
 */
export function emptyValueFor(type: string): unknown {
  switch (type) {
    case 'text':
    case 'textArea':
    case 'otp':
    case 'phone':
      return '';
    case 'checkbox':
    case 'switch':
      return false;
    case 'multiSelect':
    case 'multiFile':
      return [];
    default:
      return undefined;
  }
}

/** The value a field is reset to: its `defaultValue`, else the empty value of its type. */
export function resetValueFor(field: Readonly<{ type: string; defaultValue?: unknown }>): unknown {
  return field.defaultValue ?? emptyValueFor(field.type);
}

/**
 * The first values of a form: each field's reset value, then the caller's `defaultValues` on top.
 */
export function buildInitialValues<T extends FieldValues>(
  fields: readonly FormField<T>[],
  defaultValues: Partial<T> | undefined,
): T {
  const values: Record<string, unknown> = {};
  for (const field of getValueFields(fields)) {
    set(values, field.name, resetValueFor(field));
  }
  if (defaultValues) {
    for (const [name, value] of Object.entries(defaultValues)) {
      if (value !== undefined || get(values, name) === undefined) {
        set(values, name, value);
      }
    }
  }
  return values as T;
}

/** Reset value by field path, for `clearOnHidden` and `resetOnChange`. */
export function buildResetValues<T extends FieldValues>(
  fields: readonly FormField<T>[],
): Map<string, unknown> {
  const resets = new Map<string, unknown>();
  for (const field of getValueFields(fields)) {
    resets.set(field.name, resetValueFor(field));
  }
  return resets;
}
