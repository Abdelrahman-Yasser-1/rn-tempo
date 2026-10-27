import { View } from 'react-native';

import { Button } from '../Button';
import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { EmptyStateProps } from './types';

/** Placeholder for lists and screens with nothing to show, with an optional action. */
export function EmptyState({
  icon = 'search',
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.root}>
      <Icon name={icon} size={48} color="textSecondary" />
      <Text testID={testID ? `${testID}.title` : undefined} variant="title" align="center">
        {title}
      </Text>
      {message !== undefined && (
        <Text
          testID={testID ? `${testID}.message` : undefined}
          color="textSecondary"
          align="center"
        >
          {message}
        </Text>
      )}
      {actionLabel !== undefined && onAction !== undefined && (
        <View style={styles.action}>
          <Button
            testID={testID ? `${testID}.action` : undefined}
            title={actionLabel}
            onPress={onAction}
          />
        </View>
      )}
    </View>
  );
}
