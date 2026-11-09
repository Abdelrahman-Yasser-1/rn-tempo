import { useEffect, useRef } from 'react';
import { get, useFormContext } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';

import type { BoundFormField } from '@features/dynamic-forms/types';
import { isEqual } from '@features/dynamic-forms/utils/equal';
import { logger } from '@services/logger/logger';

import { useFormBuilderContext } from './useFormBuilderContext';
import { useLatest } from './useLatest';

/**
 * Runs the behaviors of one bound field: `calculatedValue`, `clearOnHidden`, and on a change
 * `transform`, `onValueChange`, `resetOnChange`, `validateOnChange` and `asyncValidate`.
 * Nothing here logs a value.
 */
export function useFieldBehaviors<T extends FieldValues>(
  field: BoundFormField<T>,
  values: T,
  isVisible: boolean,
): void {
  const form = useFormContext();
  const { resets, asyncErrors } = useFormBuilderContext();
  const name: string = field.name;
  const value: unknown = get(values, name);
  const fieldRef = useLatest(field);
  const valuesRef = useLatest(values);

  // calculatedValue: derived on every change of the form; the first run does not mark it dirty.
  const isFirstCalculationRef = useRef(true);
  useEffect(() => {
    const calculate = field.calculatedValue;
    if (!calculate) {
      return;
    }
    let result: unknown;
    try {
      result = calculate(values);
    } catch {
      // A throwing calculation leaves the value as it is.
      logger.warn(`dynamic-forms: calculatedValue of "${name}" threw`);
      return;
    }
    if (!isEqual(form.getValues(name), result)) {
      const isUserChange = !isFirstCalculationRef.current;
      form.setValue(name, result, { shouldValidate: isUserChange, shouldDirty: isUserChange });
    }
    isFirstCalculationRef.current = false;
  }, [field, values, form, name]);

  // clearOnHidden: when the field goes from visible to hidden.
  const wasVisibleRef = useRef(isVisible);
  useEffect(() => {
    const hasJustHidden = wasVisibleRef.current && !isVisible;
    wasVisibleRef.current = isVisible;
    if (hasJustHidden && field.clearOnHidden) {
      form.setValue(name, resets.get(name), { shouldValidate: false, shouldDirty: false });
      form.clearErrors(name);
    }
  }, [isVisible, field.clearOnHidden, form, name, resets]);

  // A change of this field's value (not the first render).
  const previousValueRef = useRef(value);
  useEffect(() => {
    if (isEqual(previousValueRef.current, value)) {
      return;
    }
    previousValueRef.current = value;
    const current = fieldRef.current;
    if (current.transform) {
      const transformed = current.transform(value);
      if (!isEqual(transformed, value)) {
        // The write comes back as another change, with the transformed value.
        form.setValue(name, transformed, { shouldValidate: false });
        return;
      }
    }
    current.onValueChange?.(value, valuesRef.current);
    for (const target of current.resetOnChange ?? []) {
      const path: string = target;
      form.setValue(path, resets.get(path), { shouldValidate: false, shouldDirty: false });
      form.clearErrors(path);
    }
    if (current.validateOnChange) {
      void form.trigger(name);
    }
  }, [value, form, name, resets, fieldRef, valuesRef]);

  // asyncValidate: debounced; a newer value cancels the pending call and ignores a late answer.
  const previousAsyncValueRef = useRef(value);
  useEffect(() => {
    if (isEqual(previousAsyncValueRef.current, value)) {
      return;
    }
    previousAsyncValueRef.current = value;
    asyncErrors.delete(name);
    const validate = fieldRef.current.asyncValidate;
    if (!validate) {
      return;
    }
    let isCancelled = false;
    const run = async () => {
      try {
        const message = await validate(value, valuesRef.current);
        if (isCancelled) {
          return;
        }
        if (message) {
          asyncErrors.set(name, message);
          form.setError(name, { type: 'async', message });
        } else if (form.getFieldState(name).error?.type === 'async') {
          form.clearErrors(name);
        }
      } catch {
        // A failed check must not block the user; the server validates again on submit.
      }
    };
    const debounceMs = fieldRef.current.asyncValidateDebounceMs ?? 0;
    const timer =
      debounceMs > 0
        ? setTimeout(() => {
            void run();
          }, debounceMs)
        : undefined;
    if (timer === undefined) {
      void run();
    }
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [value, form, name, asyncErrors, fieldRef, valuesRef]);
}
