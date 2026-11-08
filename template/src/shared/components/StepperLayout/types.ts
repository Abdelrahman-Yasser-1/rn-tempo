import type { ReactNode } from 'react';

import type { StepperVariant } from '@shared/components/Stepper';

export type StepperLayoutStep = Readonly<{
  key: string;
  /** Label shown in the Stepper. */
  label: string;
  /** Content of the step; only the current step's content is rendered. */
  content: ReactNode;
  /**
   * Runs before moving on from this step (Next or Submit). Resolve `false` to stay, e.g. after
   * showing field errors. The layout does not own a form: validation stays with the caller.
   */
  validate?: () => Promise<boolean>;
}>;

export type StepperLayoutSuccess = Readonly<{
  /** Artwork above the title; defaults to a check icon. */
  illustration?: ReactNode;
  title: string;
  message?: string;
  doneLabel: string;
  onDone: () => void;
}>;

export type StepperLayoutProps = Readonly<{
  title?: string;
  steps: readonly StepperLayoutStep[];
  /** Header back goes to the previous step first, then calls this to leave the screen. */
  onExit: () => void;
  /** Called after the last step validates. Handle your own errors; the layout only awaits it. */
  onSubmit: () => void | Promise<void>;
  /** Gate for Next/Submit, e.g. "the current step is filled in". Defaults to `true`. */
  canGoNext?: boolean;
  /** Shows a busy Submit button while the caller saves. */
  isSubmitting?: boolean;
  /** Replaces the content (and hides the footer) with the success state. */
  isComplete?: boolean;
  success?: StepperLayoutSuccess;
  variant?: StepperVariant;
  /** Zero-based step to start on. */
  initialStep?: number;
  /** Screen root testID; the parts add `.stepper`, `.back`, `.next`, `.success`. */
  testID?: string;
}>;
