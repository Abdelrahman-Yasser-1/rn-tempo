import { useImperativeHandle } from 'react';
import { FormProvider } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { FieldRenderer } from '@features/dynamic-forms/components/FieldRenderer';
import { DEFAULT_SPACING } from '@features/dynamic-forms/constants';
import { useBuilderForm } from '@features/dynamic-forms/hooks/useBuilderForm';
import { FormBuilderContext } from '@features/dynamic-forms/hooks/useFormBuilderContext';
import { getFieldKey, getHiddenNames } from '@features/dynamic-forms/utils/fieldTree';

import { styles } from './styles';
import type { FormBuilderProps, FormBuilderRef } from './types';

/**
 * A single-page form rendered from a `fields` config and validated by a Zod `schema`. Hidden
 * fields are not validated; `onSubmit` receives the typed values.
 */
export function FormBuilder<T extends FieldValues>(props: FormBuilderProps<T>) {
  const { fields, onSubmit, onSubmitInvalid, renderSubmitButton, ref, testID } = props;
  const { form, values, context } = useBuilderForm<T>({
    props,
    fields,
    getHiddenNames: (current) => getHiddenNames(fields, current),
  });
  const submit = () => {
    void form.handleSubmit(onSubmit, onSubmitInvalid)();
  };

  useImperativeHandle(ref, (): FormBuilderRef<T> => ({ ...form, submit }));

  return (
    <FormProvider {...form}>
      <FormBuilderContext value={context}>
        <View style={styles.container(props.spacing ?? DEFAULT_SPACING)} testID={testID}>
          {fields.map((field, index) => (
            <FieldRenderer key={getFieldKey(field, index)} field={field} values={values} />
          ))}
          {renderSubmitButton?.(submit)}
        </View>
      </FormBuilderContext>
    </FormProvider>
  );
}
