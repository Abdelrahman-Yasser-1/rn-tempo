import type { FieldValues } from 'react-hook-form';

import { fieldRenderers } from '@features/dynamic-forms/components/FieldRegistry';
import type {
  FieldRenderArgs,
  FieldTypeName,
} from '@features/dynamic-forms/components/FieldRegistry';
import { useFieldBehaviors } from '@features/dynamic-forms/hooks/useFieldBehaviors';
import { useFormText } from '@features/dynamic-forms/hooks/useFormText';
import type { BoundFormField } from '@features/dynamic-forms/types';

type BoundFieldProps<T extends FieldValues> = Readonly<{
  field: BoundFormField<T>;
  values: T;
  /** False when the field or a parent is hidden: nothing renders, behaviors keep running. */
  isVisible: boolean;
}>;

function renderField<K extends FieldTypeName>(type: K, args: FieldRenderArgs<K>) {
  return fieldRenderers[type](args);
}

/** One value field: runs its behaviors and renders it through the registry. */
export function BoundField<T extends FieldValues>({
  field,
  values,
  isVisible,
}: BoundFieldProps<T>) {
  const resolve = useFormText();
  useFieldBehaviors(field, values, isVisible);

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
