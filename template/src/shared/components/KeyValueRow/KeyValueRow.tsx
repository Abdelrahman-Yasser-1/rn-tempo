import { View } from 'react-native';

import { Text } from '../Text';

import { styles } from './styles';
import type { KeyValueRowProps } from './types';

/** One label/value pair, side by side or stacked. A string value is read together with its label. */
export function KeyValueRow({ label, value, layout = 'horizontal', testID }: KeyValueRowProps) {
  styles.useVariants({ layout });
  const isText = typeof value === 'string' || typeof value === 'number';
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const textAlign = layout === 'horizontal' ? 'end' : 'start';

  return (
    <View
      accessible={isText}
      accessibilityLabel={isText ? `${label}, ${String(value)}` : undefined}
      testID={testID}
      style={styles.root}
    >
      <Text testID={suffix('label')} variant="bodySmall" color="textSecondary" style={styles.label}>
        {label}
      </Text>
      <View style={styles.value}>
        {isText ? (
          <Text testID={suffix('value')} variant="bodyStrong" align={textAlign}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}
