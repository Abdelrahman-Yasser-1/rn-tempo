import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { FormBuilder } from '@features/dynamic-forms/components/FormBuilder';
import { MultiStepFormBuilder } from '@features/dynamic-forms/components/MultiStepFormBuilder';
import { Button, Text } from '@shared/components';

import { styles } from './styles';
import type { FormFlowProps } from './types';

/**
 * Renders a flow the way an app screen usually wants it: a step header ("Step 2 of 4" and the
 * title), Back and Next or Submit buttons, the review step and the draft of the flow. A single
 * page document gets a Submit button.
 */
export function FormFlow({ flow, onSubmit, testID = 'dynamic-form-flow' }: FormFlowProps) {
  const { t } = useTranslation('forms');

  if (flow.kind === 'form') {
    return (
      <FormBuilder
        fields={flow.fields}
        schema={flow.schema}
        onSubmit={onSubmit}
        draft={flow.draft}
        testID={testID}
        renderSubmitButton={(onPress) => (
          <Button title={t('flow.submit')} onPress={onPress} testID={`${testID}.submit`} />
        )}
      />
    );
  }

  return (
    <MultiStepFormBuilder
      steps={flow.steps}
      schema={flow.schema}
      onSubmit={onSubmit}
      review={flow.review}
      draft={flow.draft}
      testID={testID}
      renderStepIndicator={(index, total, title) => (
        <View style={styles.header}>
          <Text variant="caption" color="textSecondary" testID={`${testID}.step`}>
            {t('flow.stepOf', { current: index + 1, total })}
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
              title={t('flow.back')}
              variant="secondary"
              fullWidth
              disabled={navigation.isFirstStep || !navigation.canGoBack}
              onPress={navigation.onBack}
              testID={`${testID}.back`}
            />
          </View>
          <View style={styles.action}>
            <Button
              title={navigation.isLastStep ? t('flow.submit') : t('flow.next')}
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
