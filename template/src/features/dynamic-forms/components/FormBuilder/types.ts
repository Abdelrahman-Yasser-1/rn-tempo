import type { ReactNode, Ref } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import type { BaseBuilderProps, FormField } from '@features/dynamic-forms/types';

export type FormBuilderProps<T extends FieldValues> = BaseBuilderProps<T> &
  Readonly<{
    fields: readonly FormField<T>[];
    /** Renders the submit button; call `onPress` to validate and submit. */
    renderSubmitButton?: (onPress: () => void) => ReactNode;
    ref?: Ref<FormBuilderRef<T>>;
    testID?: string;
  }>;

/** The whole `useForm` API, plus `submit` and `discardDraft`. */
export type FormBuilderRef<T extends FieldValues> = UseFormReturn<T> &
  Readonly<{
    submit: () => void;
    /** Deletes the saved draft (`draft` prop) and stops saving until the next change. */
    discardDraft: () => void;
  }>;
