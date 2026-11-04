import { Box } from '../Box';
import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { FieldMessageProps } from './types';

/** Helper or error line under a form field, with an icon; errors are announced politely. */
export function FieldMessage({ message, variant = 'helper', testID }: FieldMessageProps) {
  const isError = variant === 'error';

  return (
    <Box style={styles.root}>
      <Box style={styles.icon}>
        <Icon
          name={isError ? 'alert-circle' : 'info'}
          size="sm"
          color={isError ? 'error' : 'textSecondary'}
        />
      </Box>
      <Text
        testID={testID}
        variant="caption"
        color={isError ? 'error' : 'textSecondary'}
        style={styles.text}
        accessibilityLiveRegion={isError ? 'polite' : undefined}
        accessibilityRole={isError ? 'alert' : undefined}
      >
        {message}
      </Text>
    </Box>
  );
}
