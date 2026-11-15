import type { ReactNode, Ref } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import type { StepConfig } from '@shared/components/DynamicForm/components/FieldRegistry';
import type { BaseBuilderProps } from '@shared/components/DynamicForm/hooks/useBuilderForm';

export type NavigationProps = Readonly<{
  /** Index in the `steps` array. */
  currentStep: number;
  totalSteps: number;
  /** Position among the visible steps: use it for "Step n of m". */
  visibleStepIndex: number;
  totalVisibleSteps: number;
  title: string | undefined;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  /** False on a step with `canGoBack: false`; check it with `isFirstStep`. */
  canGoBack: boolean;
  /** True on the read-only summary step added by `review`. */
  isReviewStep: boolean;
  /** True while an async `onSubmit` runs. */
  isSubmitting: boolean;
}>;

export type MultiStepFormBuilderProps<T extends FieldValues> = BaseBuilderProps<T> &
  Readonly<{
    steps: readonly StepConfig<T>[];
    /** Step index to start on; a hidden step snaps to the next visible one. */
    initialStep?: number;
    /** Adds a last, read-only summary step with an Edit action per step. */
    review?: boolean;
    renderStepIndicator?: (
      visibleStepIndex: number,
      totalVisibleSteps: number,
      title: string | undefined,
    ) => ReactNode;
    renderNavigation?: (props: NavigationProps) => ReactNode;
    ref?: Ref<MultiStepFormBuilderRef<T>>;
    testID?: string;
  }>;

export type MultiStepFormBuilderRef<T extends FieldValues> = UseFormReturn<T> &
  Readonly<{
    submit: () => void;
    /** Deletes the saved draft (`draft` prop) and stops saving until the next step change. */
    discardDraft: () => void;
    currentStep: number;
    /** Steps including the review step when `review` is on. */
    totalSteps: number;
    visibleStepIndex: number;
    totalVisibleSteps: number;
    canGoBack: boolean;
    goToStep: (step: number) => void;
    nextStep: () => Promise<void>;
    prevStep: () => void;
  }>;
