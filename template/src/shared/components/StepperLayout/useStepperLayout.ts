import { useRef, useState } from 'react';

import { useBackHandler } from '@shared/hooks';

import type { StepperLayoutProps } from './types';

type UseStepperLayoutParams = Pick<
  StepperLayoutProps,
  'steps' | 'onExit' | 'onSubmit' | 'canGoNext' | 'isComplete' | 'initialStep'
>;

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));

/**
 * Step state of a multi-step flow: `next` validates the current step and moves on (the last step
 * submits), `back` returns to the previous step and leaves the flow from the first one. Android's
 * hardware back follows `back` until the first step, where the system takes over.
 */
export function useStepperLayout({
  steps,
  onExit,
  onSubmit,
  canGoNext: isGateOpen = true,
  isComplete: isDone = false,
  initialStep = 0,
}: UseStepperLayoutParams) {
  const lastIndex = steps.length - 1;
  const [current, setCurrent] = useState(() => clamp(initialStep, lastIndex));
  const [isValidating, setIsValidating] = useState(false);
  const isBusyRef = useRef(false);
  const isFirst = current === 0;
  const isLast = current >= lastIndex;
  const canGoNext = isGateOpen && !isValidating;

  const goTo = (index: number) => {
    setCurrent(clamp(index, lastIndex));
  };

  const next = async () => {
    if (!isGateOpen || isBusyRef.current) {
      return;
    }
    isBusyRef.current = true;
    setIsValidating(true);
    try {
      const isValid = (await steps[current]?.validate?.()) ?? true;
      if (!isValid) {
        return;
      }
      if (isLast) {
        await onSubmit();
      } else {
        setCurrent(clamp(current + 1, lastIndex));
      }
    } finally {
      isBusyRef.current = false;
      setIsValidating(false);
    }
  };

  const back = () => {
    if (isFirst) {
      onExit();
    } else {
      setCurrent(current - 1);
    }
  };

  useBackHandler(() => {
    if (isDone || isFirst) {
      return false;
    }
    setCurrent(current - 1);
    return true;
  });

  return { current, isFirst, isLast, isValidating, canGoNext, next, back, goTo };
}
