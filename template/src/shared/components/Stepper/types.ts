export type StepperStep = Readonly<{
  key: string;
  label: string;
}>;

export type StepperVariant = 'numbered' | 'progress';

export type StepperProps = Readonly<{
  steps: readonly StepperStep[];
  /** Zero-based index of the active step. */
  current: number;
  /** `numbered` shows circles with labels; `progress` shows a bar with "Step n of m". */
  variant?: StepperVariant;
  testID?: string;
}>;
