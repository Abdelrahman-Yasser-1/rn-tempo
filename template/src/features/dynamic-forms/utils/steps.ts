import type { FieldValues } from 'react-hook-form';

import type { FormField } from '@features/dynamic-forms/types';

import { getHiddenNames, getValueFields } from './fieldTree';

type StepLike<T extends FieldValues> = Readonly<{
  fields: readonly FormField<T>[];
  visibleIf?: (values: T) => boolean;
}>;

/** Indexes of the steps whose `visibleIf` passes, in order. */
export function visibleStepIndexes<T extends FieldValues>(
  steps: readonly StepLike<T>[],
  values: T,
): number[] {
  return steps.flatMap((step, index) => ((step.visibleIf?.(values) ?? true) ? [index] : []));
}

/** The step to show for `wanted`: itself when visible, else the next visible one, else the last. */
export function snapToVisibleStep(wanted: number, visible: readonly number[]): number {
  return visible.find((index) => index >= wanted) ?? visible.at(-1) ?? 0;
}

/** Paths hidden by a rule, plus every field of a hidden step. */
export function hiddenNamesOfSteps<T extends FieldValues>(
  steps: readonly StepLike<T>[],
  values: T,
): string[] {
  return steps.flatMap((step) =>
    (step.visibleIf?.(values) ?? true)
      ? getHiddenNames(step.fields, values)
      : getValueFields(step.fields).map((field) => field.name),
  );
}
