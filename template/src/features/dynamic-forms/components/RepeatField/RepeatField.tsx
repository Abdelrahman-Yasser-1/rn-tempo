import type { ParseKeys } from 'i18next';
import { Fragment, useEffect } from 'react';
import { get, useFieldArray, useFormContext, useFormState } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { renderField } from '@features/dynamic-forms/components/FieldRegistry';
import { useFormText } from '@features/dynamic-forms/hooks/useFormText';
import type { RepeatFieldConfig } from '@features/dynamic-forms/types';
import { blankItem } from '@features/dynamic-forms/utils/defaults';
import { Button, Card, FieldMessage, IconButton, Text } from '@shared/components';

import { styles } from './styles';

type RepeatFieldProps<T extends FieldValues> = Readonly<{
  field: RepeatFieldConfig<T>;
  isVisible: boolean;
}>;

/**
 * A list of items (`useFieldArray`). Add and remove keep the list between `minItems` and
 * `maxItems`; each item's fields are validated by the schema at `<name>.<index>.<field>`.
 */
export function RepeatField<T extends FieldValues>({ field, isVisible }: RepeatFieldProps<T>) {
  const { t } = useTranslation('forms');
  const { t: tValidation } = useTranslation('validation');
  const resolve = useFormText();
  const { control } = useFormContext();
  const name: string = field.name;
  const { fields: rows, append, remove } = useFieldArray({ control, name });
  const { errors } = useFormState({ control, name });
  const minItems = field.minItems ?? 0;
  const maxItems = field.maxItems ?? Number.POSITIVE_INFINITY;
  const missingItems = minItems - rows.length;

  // The list is topped up to `minItems` (a restored draft or an external reset may be shorter).
  useEffect(() => {
    if (missingItems > 0) {
      append(Array.from({ length: missingItems }, () => blankItem(field.fields)));
    }
  }, [missingItems, append, field.fields]);

  if (!isVisible) {
    return null;
  }
  const testID = field.testID ?? `dynamic-form.${name}`;
  const itemLabel = resolve(field.itemLabel) ?? t('repeat.itemLabel');
  const error = get(errors, name) as { message?: string; root?: { message?: string } } | undefined;
  const errorKey = error?.message ?? error?.root?.message;
  const title = resolve(field.label);

  return (
    <View style={styles.root} testID={testID}>
      {title !== undefined && (
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
      )}
      {rows.map((row, index) => (
        <Card key={row.id} variant="outlined" testID={`${testID}.item.${String(index)}`}>
          <View style={styles.item}>
            <View style={styles.header}>
              <Text variant="label" style={styles.title}>
                {t('repeat.itemHeading', { label: itemLabel, index: index + 1 })}
              </Text>
              <IconButton
                icon="trash"
                variant="ghost"
                size="sm"
                disabled={rows.length <= minItems}
                accessibilityLabel={t('repeat.remove', { label: itemLabel, index: index + 1 })}
                onPress={() => {
                  remove(index);
                }}
                testID={`${testID}.item.${String(index)}.remove`}
              />
            </View>
            {field.fields.map((child) => (
              <Fragment key={child.name}>
                {renderField(child.type, {
                  name: `${name}.${String(index)}.${child.name}`,
                  config: child,
                  texts: {
                    label: resolve(child.label),
                    placeholder: resolve(child.placeholder),
                    helperText: resolve(child.helperText),
                    subLabel: resolve(child.subLabel),
                    tooltip: resolve(child.tooltip),
                  },
                  isRequired: child.required ?? false,
                  isDisabled: false,
                  testID: `${testID}.item.${String(index)}.${child.name}`,
                  resolve,
                })}
              </Fragment>
            ))}
          </View>
        </Card>
      ))}
      {errorKey !== undefined && (
        <FieldMessage
          variant="error"
          message={tValidation(errorKey as ParseKeys<'validation'>)}
          testID={`${testID}.error`}
        />
      )}
      <Button
        title={resolve(field.addLabel) ?? t('repeat.add')}
        variant="secondary"
        icon="plus"
        disabled={rows.length >= maxItems}
        onPress={() => {
          append(blankItem(field.fields));
        }}
        testID={`${testID}.add`}
      />
    </View>
  );
}
