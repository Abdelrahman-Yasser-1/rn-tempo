import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { StepperProps, StepperStep } from './types';

type StepStatus = 'done' | 'current' | 'upcoming';

type StepItemProps = Readonly<{
  step: StepperStep;
  index: number;
  status: StepStatus;
  isFirst: boolean;
  isLast: boolean;
  testID?: string;
}>;

function StepItem({ step, index, status, isFirst, isLast, testID }: StepItemProps) {
  const { t } = useTranslation();
  styles.useVariants({ status });
  // Literal keys, so the i18n extractor sees every one of them.
  let statusLabel = t('stepper.upcoming');
  if (status === 'done') {
    statusLabel = t('stepper.done');
  } else if (status === 'current') {
    statusLabel = t('stepper.current');
  }

  return (
    <View
      accessible
      accessibilityLabel={`${step.label}, ${statusLabel}`}
      accessibilityState={{ selected: status === 'current' }}
      testID={testID}
      style={styles.step}
    >
      <View style={styles.track}>
        <View style={styles.connector(status !== 'upcoming', isFirst)} />
        <View style={styles.circle}>
          {status === 'done' ? (
            <Icon name="check" size="sm" color="onPrimary" />
          ) : (
            <Text variant="caption" color={status === 'current' ? 'primary' : 'textSecondary'}>
              {String(index + 1)}
            </Text>
          )}
        </View>
        <View style={styles.connector(status === 'done', isLast)} />
      </View>
      <Text
        variant="caption"
        color={status === 'upcoming' ? 'textSecondary' : 'textPrimary'}
        align="center"
        style={styles.label}
      >
        {step.label}
      </Text>
    </View>
  );
}

/**
 * Progress through a multi-step flow. `numbered` is a row of circles (a check when done) with
 * labels and connectors; `progress` is a bar with "Step n of m". Reads right to left in Arabic.
 */
export function Stepper({ steps, current, variant = 'numbered', testID }: StepperProps) {
  const { t } = useTranslation();
  const total = steps.length;
  const position = Math.min(Math.max(current, 0), Math.max(total - 1, 0));

  if (variant === 'progress') {
    const label = t('stepper.progress', { current: position + 1, total });
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: total, now: position + 1 }}
        testID={testID}
        style={styles.progress}
      >
        <Text variant="label" color="textSecondary" testID={testID ? `${testID}.label` : undefined}>
          {label}
        </Text>
        <View style={styles.bar}>
          <View style={styles.fill((position + 1) / Math.max(total, 1))} />
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.numbered}>
      {steps.map((step, index) => {
        let status: StepStatus = 'upcoming';
        if (index < position) {
          status = 'done';
        } else if (index === position) {
          status = 'current';
        }
        return (
          <StepItem
            key={step.key}
            step={step}
            index={index}
            status={status}
            isFirst={index === 0}
            isLast={index === total - 1}
            testID={testID ? `${testID}.${step.key}` : undefined}
          />
        );
      })}
    </View>
  );
}
