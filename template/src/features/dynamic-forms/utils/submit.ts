import type { FieldErrors, FieldValues, SubmitHandler, UseFormReturn } from 'react-hook-form';

import { logger } from '@services/logger/logger';

/**
 * Validates and submits. react-hook-form rethrows what `onSubmit` throws; there is nobody to
 * catch it from a button press, so it is logged (the error, never the form values) and the form
 * stays as it is, with its draft.
 */
export function submitForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  onValid: SubmitHandler<T>,
  onInvalid?: (errors: FieldErrors<T>) => void,
): void {
  form
    .handleSubmit(onValid, onInvalid)()
    .catch((error: unknown) => {
      logger.error('dynamic-forms: onSubmit threw', error);
    });
}
