import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getErrorMessageKey, normalizeError } from '@services/http/errors';

import { Button } from '../Button';
import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ErrorStateProps } from './types';

/** Error placeholder: translated message from an `ApiError` plus an optional Retry button. */
export function ErrorState({
  error,
  title,
  message,
  onRetry,
  retryLabel,
  testID,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const isOffline = error !== undefined && normalizeError(error).code === 'NETWORK';

  return (
    <View accessibilityRole="alert" testID={testID} style={styles.root}>
      <Icon name={isOffline ? 'wifi-off' : 'alert-circle'} size={48} color="error" />
      <Text testID={testID ? `${testID}.title` : undefined} variant="title" align="center">
        {title ?? t('errorState.title')}
      </Text>
      <Text testID={testID ? `${testID}.message` : undefined} color="textSecondary" align="center">
        {message ?? t(getErrorMessageKey(error), { ns: 'errors' })}
      </Text>
      {onRetry !== undefined && (
        <View style={styles.action}>
          <Button
            testID={testID ? `${testID}.retry` : undefined}
            title={retryLabel ?? t('errorState.retry')}
            leftIcon="refresh"
            onPress={onRetry}
          />
        </View>
      )}
    </View>
  );
}
