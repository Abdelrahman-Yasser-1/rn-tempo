import { useEffect, useMemo, useState } from 'react';
import { get, useForm, useWatch } from 'react-hook-form';
import type {
  DefaultValues,
  FieldErrors,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';

import { logger } from '@services/logger/logger';
import { DEFAULT_SPACING } from '@shared/components/DynamicForm/constants';
import { loadDraft } from '@shared/components/DynamicForm/drafts/drafts';
import type {
  DraftConfig,
  FormChangeEvent,
  FormField,
  FormSpacing,
  ReValidationMode,
  ValidationMode,
} from '@shared/components/DynamicForm/types';
import {
  buildInitialValues,
  buildResetValues,
} from '@shared/components/DynamicForm/utils/defaults';
import { createFormResolver } from '@shared/components/DynamicForm/utils/formResolver';
import { mergeValues } from '@shared/components/DynamicForm/utils/values';

import type { FormBuilderContextValue } from './useFormBuilderContext';

/** Props shared by the single-page and the multi-step builder. */
export type BaseBuilderProps<T extends FieldValues> = Readonly<{
  /** Validates the whole form. Hidden fields are not validated. */
  schema: z.ZodType<T, FieldValues>;
  onSubmit: SubmitHandler<T>;
  onSubmitInvalid?: (errors: FieldErrors<T>) => void;
  defaultValues?: Partial<T>;
  /** An external instance. Then `mode`, `reValidateMode` and `shouldUnregister` are yours to set. */
  form?: UseFormReturn<T>;
  mode?: ValidationMode;
  reValidateMode?: ReValidationMode;
  shouldUnregister?: boolean;
  spacing?: FormSpacing;
  /** Saves the values (never sensitive or file fields) and restores them on mount. */
  draft?: DraftConfig;
  onChange?: (event: FormChangeEvent<T>) => void;
}>;

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
  const [restored] = useState(() =>
    props.draft ? loadDraft(props.draft.key, props.draft.maxAgeMs) : undefined,
  );
  const [initialValues] = useState(() =>
    buildInitialValues(fields, mergeValues<T>(defaultValues, restored?.values)),
  );
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

  /**
   * Validates and submits. react-hook-form rethrows what `onSubmit` throws; there is nobody to
   * catch it from a button press, so it is logged (the error, never the form values) and the
   * form stays as it is, with its draft.
   */
  const submitWith = (
    onValid: SubmitHandler<T>,
    onInvalid?: (errors: FieldErrors<T>) => void,
  ): void => {
    form
      .handleSubmit(onValid, onInvalid)()
      .catch((error: unknown) => {
        logger.error('dynamic-forms: onSubmit threw', error);
      });
  };

  return { form, values, initialValues, restoredStep: restored?.step, context, submitWith };
}
