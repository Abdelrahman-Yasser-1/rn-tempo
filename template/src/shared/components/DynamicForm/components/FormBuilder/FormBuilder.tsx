import { useImperativeHandle } from 'react';
import { FormProvider } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { FieldRenderer } from '@shared/components/DynamicForm/components/FieldRenderer';
import { DEFAULT_SPACING } from '@shared/components/DynamicForm/constants';
import { useBuilderForm } from '@shared/components/DynamicForm/hooks/useBuilderForm';
import { useDraft } from '@shared/components/DynamicForm/hooks/useDraft';
import { FormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';
import { getFieldKey, getHiddenNames } from '@shared/components/DynamicForm/utils/fieldTree';

import { styles } from './styles';
import type { FormBuilderProps, FormBuilderRef } from './types';

/**
 * A single-page form rendered from a `fields` config and validated by a Zod `schema`. Hidden
 * fields are not validated; `onSubmit` receives the typed values.
 */
export function FormBuilder<T extends FieldValues>(props: FormBuilderProps<T>) {
  const { fields, onSubmit, onSubmitInvalid, renderSubmitButton, ref, testID } = props;
  const { form, values, context, submitWith } = useBuilderForm<T>({
    props,
    fields,
    getHiddenNames: (current) => getHiddenNames(fields, current),
  });
  const { wrapSubmit, discard } = useDraft({ draft: props.draft, fields, form });
  const submit = () => {
    submitWith(wrapSubmit(onSubmit), onSubmitInvalid);
  };

  useImperativeHandle(ref, (): FormBuilderRef<T> => ({ ...form, submit, discardDraft: discard }));

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
