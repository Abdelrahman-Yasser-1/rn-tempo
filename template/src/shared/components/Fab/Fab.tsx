import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { FabProps } from './types';

/**
 * Floating action button at the bottom-end of its parent, above the bottom safe-area inset. Give
 * it a `label` for the extended form. Place it as a sibling of the content, inside a Screen that
 * does not already inset the bottom edge.
 */
export function Fab({
  icon,
  label,
  accessibilityLabel,
  onPress,
  visible: isVisible = true,
  testID,
}: FabProps) {
  const insets = useSafeAreaInsets();
  const isExtended = label !== undefined && label !== '';
  styles.useVariants({ isExtended });

  if (!isVisible) {
    return null;
  }

  return (
    <View style={styles.root(insets.bottom)} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        testID={testID}
        style={styles.button}
        onPress={onPress}
      >
        <Icon name={icon} color="onPrimary" />
        {isExtended && (
          <Text testID={testID ? `${testID}.label` : undefined} variant="button" color="onPrimary">
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
