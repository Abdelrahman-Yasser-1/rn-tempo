import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Text } from '../Text';

import { styles } from './styles';
import type { LoaderProps } from './types';

/** Activity indicator with an optional caption, announced as a busy progress bar. */
export function Loader({
  size = 'lg',
  color = 'primary',
  label,
  fullScreen: isFullScreen = false,
  testID,
}: LoaderProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  styles.useVariants({ fullScreen: isFullScreen });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('loader.label')}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={styles.root}
    >
      <ActivityIndicator
        testID={testID ? `${testID}.spinner` : undefined}
        size={size === 'sm' ? 'small' : 'large'}
        color={theme.colors[color]}
      />
      {label !== undefined && (
        <Text
          testID={testID ? `${testID}.label` : undefined}
          variant="bodySmall"
          color="textSecondary"
          importantForAccessibility="no"
        >
          {label}
        </Text>
      )}
    </View>
  );
}
