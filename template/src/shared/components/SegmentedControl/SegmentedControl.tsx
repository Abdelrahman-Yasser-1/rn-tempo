import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@shared/components/Icon';
import { Text } from '@shared/components/Text';

import { SEGMENT_INSET, styles } from './styles';
import type { SegmentedControlProps } from './types';
import { useSegmentedControl } from './useSegmentedControl';

const SELECTED_COLOR = 'textPrimary';
const IDLE_COLOR = 'textSecondary';

/** Two to four equal-width segments with an animated selection thumb (a content switcher). */
export function SegmentedControl({ items, value, onChange, testID }: SegmentedControlProps) {
  const { segments, thumbStyle, onLayout } = useSegmentedControl({
    items,
    value,
    inset: SEGMENT_INSET,
  });

  return (
    <View accessibilityRole="tablist" testID={testID} style={styles.track} onLayout={onLayout}>
      <Animated.View
        pointerEvents="none"
        testID={testID ? `${testID}.thumb` : undefined}
        style={[styles.thumb, thumbStyle]}
      />
      {segments.map((item) => {
        const isSelected = item.key === value;
        const color = isSelected ? SELECTED_COLOR : IDLE_COLOR;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
            testID={testID ? `${testID}.${item.key}` : undefined}
            style={styles.segment}
            onPress={() => {
              onChange(item.key);
            }}
          >
            {item.icon !== undefined && <Icon name={item.icon} size="md" color={color} />}
            <Text variant="label" color={color} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
