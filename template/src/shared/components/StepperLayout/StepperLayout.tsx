import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { ScreenLayout } from '../ScreenLayout';
import { Stepper } from '../Stepper';

import { styles } from './styles';
import type { StepperLayoutProps } from './types';
import { useStepperLayout } from './useStepperLayout';

/**
 * Multi-step form shell: a Header whose back button steps back, the Stepper, the current step's
 * content and a sticky Back / Next (Submit on the last step) footer. With `isComplete` the
 * success state replaces everything below the header. It does not own a form.
 */
export function StepperLayout({
  title,
  steps,
  onExit,
  onSubmit,
  canGoNext: isGateOpen = true,
  isSubmitting: isSubmittingProp = false,
  isComplete: isDone = false,
  success,
  variant = 'numbered',
  initialStep,
  testID,
}: StepperLayoutProps) {
  const { t } = useTranslation();
  const { current, isFirst, isLast, isValidating, canGoNext, next, back } = useStepperLayout({
    steps,
    onExit,
    onSubmit,
    canGoNext: isGateOpen,
    isComplete: isDone,
    initialStep,
  });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const isBusy = isValidating || isSubmittingProp;

  if (isDone && success !== undefined) {
    return (
      <ScreenLayout header={{ title }} testID={testID}>
        <EmptyState
          icon="circle-check"
          illustration={success.illustration}
          title={success.title}
          message={success.message}
          actionLabel={success.doneLabel}
          onAction={success.onDone}
          testID={suffix('success')}
        />
      </ScreenLayout>
    );
  }

  const footer = (
    <View style={styles.footer}>
      {!isFirst && (
        <View style={styles.action}>
          <Button
            variant="outline"
            title={t('stepperLayout.back')}
            fullWidth
            disabled={isBusy}
            onPress={back}
            testID={suffix('back')}
          />
        </View>
      )}
      <View style={styles.action}>
        <Button
          title={isLast ? t('stepperLayout.submit') : t('stepperLayout.next')}
          fullWidth
          loading={isBusy}
          disabled={!canGoNext}
          onPress={() => {
            void next();
          }}
          testID={suffix('next')}
        />
      </View>
    </View>
  );

  return (
    <ScreenLayout
      header={{ title, onBack: back }}
      scroll
      keyboardAware
      footer={footer}
      testID={testID}
    >
      <View style={styles.stepper}>
        <Stepper steps={steps} current={current} variant={variant} testID={suffix('stepper')} />
      </View>
      {steps[current]?.content}
    </ScreenLayout>
  );
}
