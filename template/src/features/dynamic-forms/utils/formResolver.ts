import { zodResolver } from '@hookform/resolvers/zod';
import { get } from 'react-hook-form';
import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

import { setPath, unsetPath } from './paths';

export type FormResolverOptions<T extends FieldValues> = Readonly<{
  schema: z.ZodType<T, FieldValues>;
  /** Paths of the hidden fields for the given values; their errors and values are dropped. */
  getHiddenNames: (values: T) => readonly string[];
  /** Pending async-validation messages by path; they count as errors until the value changes. */
  getAsyncErrors?: () => ReadonlyMap<string, string>;
}>;

/**
 * react-hook-form resolver that validates with a Zod schema, then forgets what hidden fields
 * said. Hidden fields are not validated (their errors are removed and their values left out of
 * the result), and an async-validation error blocks submit like any other. The same code serves
 * a hand-written schema and one built from JSON rules.
 */
export function createFormResolver<T extends FieldValues>({
  schema,
  getHiddenNames,
  getAsyncErrors,
}: FormResolverOptions<T>): Resolver<T> {
  const validate = zodResolver(schema);

  return async (values, context, options) => {
    const hidden = getHiddenNames(values);
    const result = await validate(values, context, options as never);
    let errors: Record<string, unknown> = result.errors;
    for (const name of hidden) {
      errors = unsetPath(errors, name);
    }
    for (const [name, message] of getAsyncErrors?.() ?? []) {
      if (!hidden.includes(name) && get(errors, name) === undefined) {
        errors = setPath(errors, name, { type: 'async', message });
      }
    }
    if (Object.keys(errors).length > 0) {
      return { values: {}, errors: errors as FieldErrors<T> };
    }
    const hasParsed = Object.keys(result.errors).length === 0;
    const parsed = hasParsed ? (result.values as T) : hidden.reduce(unsetPath, values);
    return { values: hidden.reduce(unsetPath, parsed), errors: {} };
  };
}
