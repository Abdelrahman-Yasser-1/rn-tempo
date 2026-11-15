import type { ReactNode } from 'react';
import type { ArrayPath, DeepPartial, FieldErrors, FieldValues, Path } from 'react-hook-form';
import type { z } from 'zod';

/** Text the server may send for a form the app has never seen. */
export type LocalizedText = Readonly<{ en: string; ar: string }>;

/**
 * A label, placeholder or message: a `ns:key` string (resolved with `t()`), or an explicit
 * `{ en, ar }` object (resolved by the active language).
 */
export type FormText = string | LocalizedText;

export type FormOption = Readonly<{ value: string; label: FormText; disabled?: boolean }>;

/** Gap between form elements. Same names as the theme's spacing keys. */
export type FormSpacing = 'none' | 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';

/**
 * Field type -> the type-specific part of a field config, as the pure model sees it: the options
 * of list types and the component's own `props`, which are `unknown` here. The `Form*` props are
 * typed by the `FieldRegistry` component (shared UI), whose map extends this one; a config
 * written against that map is assignable to the types below, so the utils take both.
 */
export type FieldTypeShape = {
  text: { props?: unknown };
  textArea: { props?: unknown };
  number: { props?: unknown };
  select: { options: readonly FormOption[]; props?: unknown };
  multiSelect: { options: readonly FormOption[]; props?: unknown };
  radioGroup: { options: readonly FormOption[]; props?: unknown };
  checkbox: { props?: unknown };
  switch: { props?: unknown };
  slider: { props: unknown };
  date: { props?: unknown };
  time: { props?: unknown };
  monthYear: { props?: unknown };
  timeSlot: { props: unknown };
  otp: { props?: unknown };
  phone: { props?: unknown };
  // @tempo-feature:file-picker:start
  file: { props?: unknown };
  multiFile: { props?: unknown };
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  map: { props?: unknown };
  // @tempo-feature:maps:end
};

export type FieldTypeName = keyof FieldTypeShape;

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
export type BoundFormField<T extends FieldValues, M extends FieldTypeShape = FieldTypeShape> = {
  [K in FieldTypeName]: Readonly<{ type: K; name: Path<T> }> &
    FieldTexts &
    FieldCommon &
    FieldBehaviors<T> &
    FieldVisibility<T> &
    M[K];
}[FieldTypeName];

/** A field inside a repeat item: bound to `<repeat>.<index>.<name>`, with no cross-field behaviors. */
export type RepeatItemField<M extends FieldTypeShape = FieldTypeShape> = {
  [K in FieldTypeName]: Readonly<{ type: K; name: string; defaultValue?: unknown }> &
    FieldTexts &
    FieldCommon &
    M[K];
}[FieldTypeName];

/** A list of items that each hold the same `fields`, added and removed by the user (`useFieldArray`). */
export type RepeatFieldConfig<
  T extends FieldValues,
  M extends FieldTypeShape = FieldTypeShape,
> = Readonly<{
  type: 'repeat';
  name: ArrayPath<T>;
  fields: readonly RepeatItemField<M>[];
  /** The list starts with this many items and cannot go below it. Default 0. */
  minItems?: number;
  /** The add button is disabled at this many items. Default: no limit. */
  maxItems?: number;
  /** Heading of each item, followed by its number. */
  itemLabel?: FormText;
  addLabel?: FormText;
  testID?: string;
}> &
  FieldTexts &
  FieldVisibility<T>;

/** Decorative or informational content outside the form state. */
export type CustomFieldConfig<T extends FieldValues> = Readonly<{
  type: 'custom';
  render: (values: DeepPartial<T>) => ReactNode;
}> &
  FieldVisibility<T>;

/** Children side by side. Rows hold fields, never layouts. */
export type RowFieldConfig<
  T extends FieldValues,
  M extends FieldTypeShape = FieldTypeShape,
> = Readonly<{
  type: 'row';
  fields: readonly (BoundFormField<T, M> | CustomFieldConfig<T>)[];
  /** Flex weight per child; default 1 each. */
  flex?: readonly number[];
  spacing?: FormSpacing;
}> &
  FieldVisibility<T>;

/** Children stacked in a container. Groups may hold rows and groups. */
export type GroupFieldConfig<
  T extends FieldValues,
  M extends FieldTypeShape = FieldTypeShape,
> = Readonly<{
  type: 'group';
  fields: readonly FormField<T, M>[];
  spacing?: FormSpacing;
}> &
  FieldVisibility<T>;

export type FormField<T extends FieldValues, M extends FieldTypeShape = FieldTypeShape> =
  | BoundFormField<T, M>
  | RepeatFieldConfig<T, M>
  | CustomFieldConfig<T>
  | RowFieldConfig<T, M>
  | GroupFieldConfig<T, M>;

/** Opt-in draft persistence. `key` names the storage entry (`forms.draft.<key>`). */
export type DraftConfig = Readonly<{
  key: string;
  /** Single-page forms only: pause before a change is written. Default 500 ms. */
  debounceMs?: number;
  /** A draft saved longer ago than this is ignored and deleted. Default 7 days. */
  maxAgeMs?: number;
}>;

export type FormChangeEvent<T extends FieldValues> = Readonly<{
  name?: Path<T>;
  value?: unknown;
  values: DeepPartial<T>;
  formState: Readonly<{ isValid: boolean; isDirty: boolean; errors: FieldErrors<T> }>;
}>;

/** One step of a multi-step form. */
export type StepConfig<
  T extends FieldValues,
  M extends FieldTypeShape = FieldTypeShape,
> = Readonly<{
  /** Stable name; used by the review step and as a test ID part. */
  id?: string;
  title?: FormText;
  fields: readonly FormField<T, M>[];
  /** False skips the step. It sees all values, so it can depend on any step. */
  visibleIf?: ConditionFunction<T>;
  /** False removes the way back from this step. Default true. */
  canGoBack?: boolean;
  onStepEnter?: (values: T, direction: StepDirection) => void;
  onStepLeave?: (values: T, direction: StepDirection) => void;
}>;

type BuiltSchema = z.ZodType<Record<string, unknown>, FieldValues>;

/** A document or a code flow turned into what the builders take. */
export type BuiltForm =
  | Readonly<{
      kind: 'form';
      id: string;
      fields: FormField<FieldValues>[];
      schema: BuiltSchema;
      draft: DraftConfig | undefined;
    }>
  | Readonly<{
      kind: 'flow';
      id: string;
      steps: StepConfig<FieldValues>[];
      schema: BuiltSchema;
      review: boolean;
      draft: DraftConfig | undefined;
    }>;

export type FromJsonResult =
  | Readonly<{ success: true; form: BuiltForm }>
  | Readonly<{ success: false; issues: readonly string[] }>;

/** The params of the `DynamicFormFlow` route: the id of a flow listed in `flows/flows.ts`. */
export type DynamicFormFlowParams = Readonly<{ flowId: string }>;
