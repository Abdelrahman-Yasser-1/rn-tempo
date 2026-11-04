import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';

import { ListItemContent } from '../ListItemContent';

import { styles } from './styles';
import type { ListItemProps } from './types';

const CHEVRON = { type: 'chevron' } as const;

/** Row with a title, optional subtitle and leading/trailing content; pressable with `onPress`. */
export function ListItem({
  title,
  subtitle,
  meta,
  layout,
  leading,
  trailing,
  left,
  right,
  showChevron: shouldShowChevron = false,
  showDivider: shouldShowDivider = false,
  disabled: isDisabled = false,
  accessibilityLabel,
  accessibilityState,
  onPress,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: ListItemProps) {
  const { animatedStyle, handlers } = usePressFeedback();
  const state = { ...accessibilityState, disabled: isDisabled };
  styles.useVariants({ divider: shouldShowDivider });

  const content = (
    <ListItemContent
      title={title}
      subtitle={subtitle}
      meta={meta}
      layout={layout}
      leading={leading}
      trailing={trailing ?? (shouldShowChevron && onPress !== undefined ? CHEVRON : undefined)}
      left={left}
      right={right}
      partsTestID={testID}
    />
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} style={styles.root}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={(event) => {
        handlers.onPressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        handlers.onPressOut();
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[styles.root, animatedStyle]}>{content}</Animated.View>
    </Pressable>
  );
}
