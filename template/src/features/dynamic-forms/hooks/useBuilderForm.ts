import { useEffect, useMemo, useState } from 'react';
import { get, useForm, useWatch } from 'react-hook-form';
import type { DefaultValues, FieldValues } from 'react-hook-form';

import { DEFAULT_SPACING } from '@features/dynamic-forms/constants';
import type { BaseBuilderProps, FormChangeEvent, FormField } from '@features/dynamic-forms/types';
import { buildInitialValues, buildResetValues } from '@features/dynamic-forms/utils/defaults';
import { createFormResolver } from '@features/dynamic-forms/utils/formResolver';

import type { FormBuilderContextValue } from './useFormBuilderContext';

type UseBuilderFormOptions<T extends FieldValues> = Readonly<{
  props: BaseBuilderProps<T>;
  /** Every field of the form, whatever step it is on. */
  fields: readonly FormField<T>[];
  /** Paths hidden for the given values (fields hidden by a rule, and the fields of hidden steps). */
  getHiddenNames: (values: T) => readonly string[];
}>;

/**
 * The form instance, the live values and the shared context of a builder: initial values from the
 * config, a resolver that skips hidden fields, and the `onChange` event.
 */
export function useBuilderForm<T extends FieldValues>({
  props,
  fields,
  getHiddenNames,
}: UseBuilderFormOptions<T>) {
  const { schema, defaultValues, mode, reValidateMode, shouldUnregister, onChange } = props;
  const [asyncErrors] = useState(() => new Map<string, string>());
  // A new resolver each render is fine: react-hook-form reads `resolver` from the latest options.
  const resolver = createFormResolver<T>({
    schema,
    getHiddenNames,
    getAsyncErrors: () => asyncErrors,
  });
  const [initialValues] = useState(() => buildInitialValues(fields, defaultValues));
  const internalForm = useForm<T, unknown, T>({
    resolver,
    defaultValues: initialValues as DefaultValues<T>,
    mode,
    reValidateMode,
    shouldUnregister,
  });
  const form = props.form ?? internalForm;
  const values = useWatch({ control: form.control }) as T;
  const resets = useMemo(() => buildResetValues(fields), [fields]);

  useEffect(() => {
    if (!onChange) {
      return;
    }
    const subscription = form.watch((watched, { name }) => {
      onChange({
        name: name,
        value: name ? get(watched, name) : undefined,
        values: watched,
        formState: {
          isValid: form.formState.isValid,
          isDirty: form.formState.isDirty,
          errors: form.formState.errors,
        },
      } satisfies FormChangeEvent<T>);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form, onChange]);

  const context: FormBuilderContextValue = useMemo(
    () => ({ resets, asyncErrors, spacing: props.spacing ?? DEFAULT_SPACING }),
    [resets, asyncErrors, props.spacing],
  );

  return { form, values, initialValues, context };
}
