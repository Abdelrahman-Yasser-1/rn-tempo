import type { FieldValues } from 'react-hook-form';

import { renderField } from '@shared/components/DynamicForm/components/FieldRegistry';
import type { BoundFormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { useFormText } from '@shared/components/DynamicForm/hooks/useFormText';

import { useBoundField } from './useBoundField';

type FormBoundFieldProps<T extends FieldValues> = Readonly<{
  field: BoundFormField<T>;
  values: T;
  /** False when the field or a parent is hidden: nothing renders, behaviors keep running. */
  isVisible: boolean;
}>;

/** One value field: runs its behaviors and renders it through the registry. */
export function BoundField<T extends FieldValues>({
  field,
  values,
  isVisible,
}: FormBoundFieldProps<T>) {
  const resolve = useFormText();
  useBoundField(field, values, isVisible);

  if (!isVisible) {
    return null;
  }
  const isDisabled = (field.disabledIf?.(values) ?? false) || field.calculatedValue !== undefined;
  return renderField(field.type, {
    name: field.name,
    config: field,
    texts: {
      label: resolve(field.label),
      placeholder: resolve(field.placeholder),
      helperText: resolve(field.helperText),
      subLabel: resolve(field.subLabel),
      tooltip: resolve(field.tooltip),
    },
    isRequired: field.required ?? false,
    isDisabled,
    testID: field.testID ?? `dynamic-form.${field.name}`,
    resolve,
  });
}
