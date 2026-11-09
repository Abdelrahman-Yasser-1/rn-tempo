import { useEffect, useRef, useState } from 'react';
import type { FieldValues, SubmitHandler, UseFormReturn } from 'react-hook-form';

import { DEFAULT_DRAFT_DEBOUNCE_MS } from '@features/dynamic-forms/constants';
import { useLatest } from '@features/dynamic-forms/hooks/useLatest';
import type { DraftConfig, FormField } from '@features/dynamic-forms/types';
import { discardDraft, getDraftSession, saveDraft } from '@features/dynamic-forms/utils/draft';

type UseDraftOptions<T extends FieldValues> = Readonly<{
  draft: DraftConfig | undefined;
  fields: readonly FormField<T>[];
  form: UseFormReturn<T>;
  /** Current step of a multi-step form: the draft is saved when it changes. Omit for one page. */
  step?: number;
}>;

/**
 * Saves the draft of a form: debounced on change for one page, on step change for a wizard.
 * Returns `wrapSubmit` (clears the draft after a successful submit) and `discard`.
 */
export function useDraft<T extends FieldValues>({ draft, fields, form, step }: UseDraftOptions<T>) {
  const key = draft?.key;
  const debounceMs = draft?.debounceMs ?? DEFAULT_DRAFT_DEBOUNCE_MS;
  const isWizard = step !== undefined;
  const fieldsRef = useLatest(fields);
  // Captured at mount: a save from a form that outlives its user must not write.
  const [session] = useState(getDraftSession);
  // Set after a discard so a pending save does not bring the draft back.
  const isDiscardedRef = useRef(false);

  // One page: write a pause after the last change, and once more when the form goes away.
  useEffect(() => {
    if (key === undefined || isWizard) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      if (!isDiscardedRef.current) {
        saveDraft(key, fieldsRef.current, form.getValues(), { session });
      }
    };
    const subscription = form.watch(() => {
      isDiscardedRef.current = false;
      clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    });
    return () => {
      subscription.unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        flush();
      }
    };
  }, [key, isWizard, debounceMs, form, fieldsRef, session]);

  // Wizard: write when the step changes (not on mount).
  const previousStepRef = useRef(step);
  useEffect(() => {
    if (previousStepRef.current === step) {
      return;
    }
    previousStepRef.current = step;
    isDiscardedRef.current = false;
    if (key !== undefined) {
      saveDraft(key, fieldsRef.current, form.getValues(), { step, session });
    }
  }, [step, key, form, fieldsRef, session]);

  const discard = () => {
    isDiscardedRef.current = true;
    if (key !== undefined) {
      discardDraft(key);
    }
  };

  const wrapSubmit =
    (onSubmit: SubmitHandler<T>): SubmitHandler<T> =>
    async (values, event) => {
      await onSubmit(values, event);
      discard();
    };

  return { wrapSubmit, discard };
}
