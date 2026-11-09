import type { ReactNode } from 'react';
import type {
  DeepPartial,
  FieldErrors,
  FieldValues,
  Path,
  SubmitHandler,
  UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';

import type {
  FieldTypeMap,
  FieldTypeName,
  FormOption,
  FormText,
  LocalizedText,
} from '@features/dynamic-forms/components/FieldRegistry/types';
import type { SpacingKey } from '@theme/index';

export type { FormOption, FormText, LocalizedText };

/** The texts every field can carry; a component that has no such slot ignores it. */
export type FieldTexts = Readonly<{
  label?: FormText;
  placeholder?: FormText;
  helperText?: FormText;
  subLabel?: FormText;
  tooltip?: FormText;
}>;

export type ConditionFunction<T extends FieldValues> = (values: T) => boolean;

/** Same names as react-hook-form's `mode`. */
export type ValidationMode = 'onBlur' | 'onChange' | 'onSubmit' | 'onTouched' | 'all';
export type ReValidationMode = 'onBlur' | 'onChange' | 'onSubmit';
export type StepDirection = 'next' | 'back';

/** Behaviors of a bound field. Functions, so they exist in code configs only (not in JSON). */
export type FieldBehaviors<T extends FieldValues> = Readonly<{
  /** Derives the value from all values; the field becomes read-only. */
  calculatedValue?: (values: T) => unknown;
  /** Value used when the field is reset (`clearOnHidden`, `resetOnChange`); else the type's empty value. */
  defaultValue?: unknown;
  /** Resets the field when `visibleIf` turns false. */
  clearOnHidden?: boolean;
  /** When this field changes, reset these fields to their defaults. */
  resetOnChange?: readonly Path<T>[];
  /** Fires when the value changes (not on mount). */
  onValueChange?: (value: unknown, values: T) => void;
  /** Maps the raw value before it is stored (trim, uppercase). Must be idempotent. */
  transform?: (value: unknown) => unknown;
  /** Server-side check. Resolve a message key (`ns:key`) for an error, `undefined` when valid. */
  asyncValidate?: (value: unknown, values: T) => Promise<string | undefined>;
  /** Pause before `asyncValidate` runs. Default 0. */
  asyncValidateDebounceMs?: number;
  /** Validate this field on every change instead of waiting for submit. */
  validateOnChange?: boolean;
}>;

export type FieldVisibility<T extends FieldValues> = Readonly<{
  visibleIf?: ConditionFunction<T>;
  disabledIf?: ConditionFunction<T>;
}>;

/** Shown as a `*`; validation itself comes from the schema. */
type FieldCommon = Readonly<{
  required?: boolean;
  /** Never saved in a draft or shown in the review. Default: true for `otp` and secure text. */
  sensitive?: boolean;
  testID?: string;
}>;

/** A bound field: a discriminated union keyed on `type`, one member per `FieldTypeMap` entry. */
export type BoundFormField<T extends FieldValues> = {
  [K in FieldTypeName]: Readonly<{ type: K; name: Path<T> }> &
    FieldTexts &
    FieldCommon &
    FieldBehaviors<T> &
    FieldVisibility<T> &
    FieldTypeMap[K];
}[FieldTypeName];

/** Decorative or informational content outside the form state. */
export type CustomFieldConfig<T extends FieldValues> = Readonly<{
  type: 'custom';
  render: (values: DeepPartial<T>) => ReactNode;
}> &
  FieldVisibility<T>;

/** Children side by side. Rows hold fields, never layouts. */
export type RowFieldConfig<T extends FieldValues> = Readonly<{
  type: 'row';
  fields: readonly (BoundFormField<T> | CustomFieldConfig<T>)[];
  /** Flex weight per child; default 1 each. */
  flex?: readonly number[];
  spacing?: SpacingKey;
}> &
  FieldVisibility<T>;

/** Children stacked in a container. Groups may hold rows and groups. */
export type GroupFieldConfig<T extends FieldValues> = Readonly<{
  type: 'group';
  fields: readonly FormField<T>[];
  spacing?: SpacingKey;
}> &
  FieldVisibility<T>;

export type FormField<T extends FieldValues> =
  BoundFormField<T> | CustomFieldConfig<T> | RowFieldConfig<T> | GroupFieldConfig<T>;

export type FormChangeEvent<T extends FieldValues> = Readonly<{
  name?: Path<T>;
  value?: unknown;
  values: DeepPartial<T>;
  formState: Readonly<{ isValid: boolean; isDirty: boolean; errors: FieldErrors<T> }>;
}>;

/** Props shared by the single-page and the multi-step builder. */
export type BaseBuilderProps<T extends FieldValues> = Readonly<{
  /** Validates the whole form. Hidden fields are not validated. */
  schema: z.ZodType<T, FieldValues>;
  onSubmit: SubmitHandler<T>;
  onSubmitInvalid?: (errors: FieldErrors<T>) => void;
  defaultValues?: Partial<T>;
  /** An external instance. Then `mode`, `reValidateMode` and `shouldUnregister` are yours to set. */
  form?: UseFormReturn<T>;
  mode?: ValidationMode;
  reValidateMode?: ReValidationMode;
  shouldUnregister?: boolean;
  spacing?: SpacingKey;
  onChange?: (event: FormChangeEvent<T>) => void;
}>;
