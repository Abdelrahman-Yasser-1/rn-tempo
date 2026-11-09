import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { get } from 'react-hook-form';
import type { FieldErrors, FieldValues, Path } from 'react-hook-form';

import { useBuilderForm } from '@features/dynamic-forms/hooks/useBuilderForm';
import { useDraft } from '@features/dynamic-forms/hooks/useDraft';
import { useFormText } from '@features/dynamic-forms/hooks/useFormText';
import { useLatest } from '@features/dynamic-forms/hooks/useLatest';
import type { StepDirection } from '@features/dynamic-forms/types';
import { getValueFields, getVisibleNames } from '@features/dynamic-forms/utils/fieldTree';
import {
  hiddenNamesOfSteps,
  snapToVisibleStep,
  visibleStepIndexes,
} from '@features/dynamic-forms/utils/steps';
import { submitForm } from '@features/dynamic-forms/utils/submit';

import type { MultiStepFormBuilderProps, MultiStepFormBuilderRef, NavigationProps } from './types';

/** Step state, navigation and the imperative ref of a multi-step form. */
export function useMultiStepFormBuilder<T extends FieldValues>(
  props: MultiStepFormBuilderProps<T>,
) {
  const { steps, initialStep, onSubmit, onSubmitInvalid, ref } = props;
  const resolve = useFormText();
  const allFields = steps.flatMap((step) => step.fields);
  const { form, values, initialValues, restoredStep, context } = useBuilderForm<T>({
    props,
    fields: allFields,
    getHiddenNames: (current) => hiddenNamesOfSteps(steps, current),
  });
  const [requestedStep, setRequestedStep] = useState(() =>
    snapToVisibleStep(restoredStep ?? initialStep ?? 0, visibleStepIndexes(steps, initialValues)),
  );
  const latestSteps = useLatest(steps);

  const visible = visibleStepIndexes(steps, values);
  // A step that became hidden is replaced by the next visible one, with no state to sync.
  const currentStep = visible.includes(requestedStep)
    ? requestedStep
    : snapToVisibleStep(requestedStep, visible);
  const visibleStepIndex = Math.max(0, visible.indexOf(currentStep));
  const totalVisibleSteps = visible.length;
  const isFirstStep = visibleStepIndex === 0;
  const isLastStep = visibleStepIndex === totalVisibleSteps - 1;
  const canGoBack = steps[currentStep]?.canGoBack !== false;

  // The first step is "entered" once, on mount; later moves call the hooks in `moveTo`.
  const firstStepRef = useRef(currentStep);
  const hasEnteredFirstStepRef = useRef(false);
  useEffect(() => {
    if (hasEnteredFirstStepRef.current) {
      return;
    }
    hasEnteredFirstStepRef.current = true;
    latestSteps.current[firstStepRef.current]?.onStepEnter?.(form.getValues(), 'next');
  }, [form, latestSteps]);

  const moveTo = (target: number, direction: StepDirection) => {
    steps[currentStep]?.onStepLeave?.(form.getValues(), direction);
    setRequestedStep(target);
    steps[target]?.onStepEnter?.(form.getValues(), direction);
  };

  const onNext = async () => {
    const names = getVisibleNames(steps[currentStep]?.fields ?? [], form.getValues());
    const isValid = names.length === 0 || (await form.trigger(names as Path<T>[]));
    const next = visible[visibleStepIndex + 1];
    if (isValid && next !== undefined) {
      moveTo(next, 'next');
    }
  };

  const onBack = () => {
    const previous = visible[visibleStepIndex - 1];
    if (canGoBack && previous !== undefined) {
      moveTo(previous, 'back');
    }
  };

  const goToStep = (step: number) => {
    if (step !== currentStep && step >= 0 && step < steps.length) {
      moveTo(step, step > currentStep ? 'next' : 'back');
    }
  };

  // After a failed submit, show the first step that holds an error.
  const onInvalid = (errors: FieldErrors<T>) => {
    const target = visible.find((index) =>
      getValueFields(steps[index]?.fields ?? []).some((field) => get(errors, field.name)),
    );
    if (target !== undefined && target !== currentStep) {
      moveTo(target, target > currentStep ? 'next' : 'back');
    }
    onSubmitInvalid?.(errors);
  };

  const { wrapSubmit, discard } = useDraft({
    draft: props.draft,
    fields: allFields,
    form,
    step: currentStep,
  });

  const submit = () => {
    submitForm(form, wrapSubmit(onSubmit), onInvalid);
  };

  useImperativeHandle(ref, (): MultiStepFormBuilderRef<T> => ({
    ...form,
    submit,
    discardDraft: discard,
    currentStep,
    totalSteps: steps.length,
    visibleStepIndex,
    totalVisibleSteps,
    canGoBack,
    goToStep,
    nextStep: onNext,
    prevStep: onBack,
  }));

  const title = resolve(steps[currentStep]?.title);
  const navigation: NavigationProps = {
    currentStep,
    totalSteps: steps.length,
    visibleStepIndex,
    totalVisibleSteps,
    title,
    onNext: () => {
      void onNext();
    },
    onBack,
    onSubmit: submit,
    isFirstStep,
    isLastStep,
    canGoBack,
    isSubmitting: form.formState.isSubmitting,
  };

  return { form, values, context, currentStep, navigation, title };
}
