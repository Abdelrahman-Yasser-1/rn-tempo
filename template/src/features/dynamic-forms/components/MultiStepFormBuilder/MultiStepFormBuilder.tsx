import { FormProvider } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { View } from 'react-native';

import { FieldRenderer } from '@features/dynamic-forms/components/FieldRenderer';
import { styles } from '@features/dynamic-forms/components/FormBuilder/styles';
import { DEFAULT_SPACING } from '@features/dynamic-forms/constants';
import { FormBuilderContext } from '@features/dynamic-forms/hooks/useFormBuilderContext';
import { getFieldKey } from '@features/dynamic-forms/utils/fieldTree';

import type { MultiStepFormBuilderProps } from './types';
import { useMultiStepFormBuilder } from './useMultiStepFormBuilder';

/**
 * A wizard: the fields of the current step, a step indicator and navigation you render yourself.
 * Next validates the visible fields of the step; hidden steps are skipped both ways.
 */
export function MultiStepFormBuilder<T extends FieldValues>(props: MultiStepFormBuilderProps<T>) {
  const { steps, renderStepIndicator, renderNavigation, testID } = props;
  const vm = useMultiStepFormBuilder(props);
  const { navigation } = vm;

  return (
    <FormProvider {...vm.form}>
      <FormBuilderContext value={vm.context}>
        {renderStepIndicator?.(navigation.visibleStepIndex, navigation.totalVisibleSteps, vm.title)}
        <View style={styles.container(props.spacing ?? DEFAULT_SPACING)} testID={testID}>
          {(steps[vm.currentStep]?.fields ?? []).map((field, index) => (
            <FieldRenderer key={getFieldKey(field, index)} field={field} values={vm.values} />
          ))}
        </View>
        {renderNavigation?.(navigation)}
      </FormBuilderContext>
    </FormProvider>
  );
}
