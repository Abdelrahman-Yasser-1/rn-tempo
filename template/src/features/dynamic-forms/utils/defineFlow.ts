import type { FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import type { StepConfig } from '@features/dynamic-forms/components/MultiStepFormBuilder/types';
import type { DraftConfig } from '@features/dynamic-forms/types';
import type { BuiltForm } from '@features/dynamic-forms/utils/fromJson';

type FlowInput<T extends FieldValues> = Readonly<{
  id: string;
  steps: StepConfig<T>[];
  schema: z.ZodType<T, FieldValues>;
  review?: boolean;
  draft?: DraftConfig;
}>;

/**
 * Wraps a typed code flow in the shape the flow screen takes, so code flows and flows built
 * from JSON are listed side by side. The values lose their type here (a list of flows holds
 * different forms); inside the flow, everything stays typed.
 */
export function defineFlow<T extends FieldValues>(flow: FlowInput<T>): BuiltForm {
  return {
    kind: 'flow',
    id: flow.id,
    // One cast: `T` appears in function parameters (visibleIf, calculatedValue, ...).
    steps: flow.steps as unknown as StepConfig<FieldValues>[],
    schema: flow.schema as unknown as z.ZodType<Record<string, unknown>, FieldValues>,
    review: flow.review ?? false,
    draft: flow.draft,
  };
}
