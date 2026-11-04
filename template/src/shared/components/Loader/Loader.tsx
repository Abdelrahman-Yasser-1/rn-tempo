import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Text } from '../Text';

import { styles } from './styles';
import type { LoaderProps } from './types';

/** Claims every touch so nothing underneath the overlay reacts. */
const blockTouches = () => true;

/**
 * Activity indicator with an optional caption, announced as a busy progress bar. The `overlay`
 * variant covers its parent and blocks interaction while work is in progress.
 */
export function Loader({
  size = 'lg',
  color = 'primary',
  label,
  variant = 'inline',
  testID,
}: LoaderProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  styles.useVariants({ variant });
  const isOverlay = variant === 'overlay';

  const content = (
    <>
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
    </>
  );

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('loader.label')}
      accessibilityState={{ busy: true }}
      accessibilityViewIsModal={isOverlay}
      onStartShouldSetResponder={isOverlay ? blockTouches : undefined}
      testID={testID}
      style={styles.root}
    >
      {isOverlay ? <View style={styles.panel}>{content}</View> : content}
    </View>
  );
}
