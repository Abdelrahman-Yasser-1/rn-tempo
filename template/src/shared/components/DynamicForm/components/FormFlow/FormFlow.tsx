import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@shared/components/Button';
import type {
  FormField,
  StepConfig,
} from '@shared/components/DynamicForm/components/FieldRegistry';
import { FormBuilder } from '@shared/components/DynamicForm/components/FormBuilder';
import { MultiStepFormBuilder } from '@shared/components/DynamicForm/components/MultiStepFormBuilder';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { FormFlowProps } from './types';

/**
 * Renders a flow the way an app screen usually wants it: a step header ("Step 2 of 4" and the
 * title), Back and Next or Submit buttons, the review step and the draft of the flow. A single
 * page document gets a Submit button.
 */
export function FormFlow({ flow, onSubmit, testID = 'dynamic-form-flow' }: FormFlowProps) {
  const { t } = useTranslation();
  // A built flow comes from a typed code flow or a document the JSON schema checked. The pure
  // model types the `Form*` props as `unknown`, so the builders get the typed view of the same value.
  const formFields = flow.kind === 'form' ? (flow.fields as readonly FormField<FieldValues>[]) : [];
  const steps = flow.kind === 'flow' ? (flow.steps as readonly StepConfig<FieldValues>[]) : [];

  if (flow.kind === 'form') {
    return (
      <FormBuilder
        fields={formFields}
        schema={flow.schema}
        onSubmit={onSubmit}
        draft={flow.draft}
        testID={testID}
        renderSubmitButton={(onPress) => (
          <Button
            title={t('formBuilder.flow.submit')}
            onPress={onPress}
            testID={`${testID}.submit`}
          />
        )}
      />
    );
  }

  return (
    <MultiStepFormBuilder
      steps={steps}
      schema={flow.schema}
      onSubmit={onSubmit}
      review={flow.review}
      draft={flow.draft}
      testID={testID}
      renderStepIndicator={(index, total, title) => (
        <View style={styles.header}>
          <Text variant="caption" color="textSecondary" testID={`${testID}.step`}>
            {t('formBuilder.flow.stepOf', { current: index + 1, total })}
          </Text>
          {title !== undefined && (
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          )}
        </View>
      )}
      renderNavigation={(navigation) => (
        <View style={styles.navigation}>
          <View style={styles.action}>
            <Button
              title={t('formBuilder.flow.back')}
              variant="secondary"
              fullWidth
              disabled={navigation.isFirstStep || !navigation.canGoBack}
              onPress={navigation.onBack}
              testID={`${testID}.back`}
            />
          </View>
          <View style={styles.action}>
            <Button
              title={
                navigation.isLastStep ? t('formBuilder.flow.submit') : t('formBuilder.flow.next')
              }
              fullWidth
              loading={navigation.isSubmitting}
              onPress={navigation.isLastStep ? navigation.onSubmit : navigation.onNext}
              testID={navigation.isLastStep ? `${testID}.submit` : `${testID}.next`}
            />
          </View>
        </View>
      )}
    />
  );
}
