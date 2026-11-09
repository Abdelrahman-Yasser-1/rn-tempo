import type { FieldValues } from 'react-hook-form';

import { NON_PERSISTED_TYPES, SENSITIVE_BY_DEFAULT_TYPES } from '@features/dynamic-forms/constants';
import type { BoundFormField, FormField, RepeatFieldConfig } from '@features/dynamic-forms/types';

/** A field that holds a value, with the visibility it has once every parent is considered. */
export type ValueField<T extends FieldValues> = Readonly<{
  field: BoundFormField<T> | RepeatFieldConfig<T>;
  isVisible: boolean;
}>;

/**
 * Lists the fields that hold a value, descending into rows and groups. A field is visible only
 * when its own `visibleIf` and the ones of its parents pass.
 */
export function walkFields<T extends FieldValues>(
  fields: readonly FormField<T>[],
  values: T,
  isParentVisible = true,
): ValueField<T>[] {
  return fields.flatMap((field): ValueField<T>[] => {
    const isVisible = isParentVisible && (field.visibleIf?.(values) ?? true);
    switch (field.type) {
      case 'custom':
        return [];
      case 'row':
      case 'group':
        return walkFields<T>(field.fields, values, isVisible);
      default:
        return [{ field, isVisible }];
    }
  });
}

/** Paths of the fields that are hidden for `values` (a hidden repeat hides its items too). */
export function getHiddenNames<T extends FieldValues>(
  fields: readonly FormField<T>[],
  values: T,
): string[] {
  return walkFields(fields, values)
    .filter(({ isVisible }) => !isVisible)
    .map(({ field }) => field.name);
}

/** Paths of the fields that are visible for `values`. */
export function getVisibleNames<T extends FieldValues>(
  fields: readonly FormField<T>[],
  values: T,
): string[] {
  return walkFields(fields, values)
    .filter(({ isVisible }) => isVisible)
    .map(({ field }) => field.name);
}

/** Every value field, ignoring visibility. */
export function getValueFields<T extends FieldValues>(
  fields: readonly FormField<T>[],
): (BoundFormField<T> | RepeatFieldConfig<T>)[] {
  return fields.flatMap((field) => {
    switch (field.type) {
      case 'custom':
        return [];
      case 'row':
      case 'group':
        return getValueFields<T>(field.fields);
      default:
        return [field];
    }
  });
}

type SensitivityInput = Readonly<{
  type: string;
  sensitive?: boolean;
  props?: unknown;
}>;

/** True for a field marked `sensitive`, an OTP, or a text field with `secureTextEntry`. */
export function isSensitive(field: SensitivityInput): boolean {
  if (field.sensitive !== undefined) {
    return field.sensitive;
  }
  if (SENSITIVE_BY_DEFAULT_TYPES.has(field.type)) {
    return true;
  }
  const props = field.props;
  return (
    typeof props === 'object' &&
    props !== null &&
    'secureTextEntry' in props &&
    props.secureTextEntry === true
  );
}

/** True when the value of this field type must never be written to a draft. */
export function isNeverPersisted(field: SensitivityInput): boolean {
  return isSensitive(field) || NON_PERSISTED_TYPES.has(field.type);
}

/** A stable React key: the path for value fields, `type-index` for layouts. */
export function getFieldKey<T extends FieldValues>(field: FormField<T>, index: number): string {
  return 'name' in field ? field.name : `${field.type}-${String(index)}`;
}
