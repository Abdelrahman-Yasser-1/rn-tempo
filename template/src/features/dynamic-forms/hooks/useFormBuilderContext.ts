import { createContext, use } from 'react';

import type { SpacingKey } from '@theme/index';

export type FormBuilderContextValue = Readonly<{
  /** Reset value by field path (`clearOnHidden`, `resetOnChange`). */
  resets: ReadonlyMap<string, unknown>;
  /** Pending async-validation errors by field path; the resolver merges them in. */
  asyncErrors: Map<string, string>;
  spacing: SpacingKey;
}>;

export const FormBuilderContext = createContext<FormBuilderContextValue | undefined>(undefined);

/** What the builder shares with its field renderers; only valid under a builder. */
export function useFormBuilderContext(): FormBuilderContextValue {
  const value = use(FormBuilderContext);
  if (value === undefined) {
    throw new Error('Form fields must render inside a FormBuilder or MultiStepFormBuilder');
  }
  return value;
}
