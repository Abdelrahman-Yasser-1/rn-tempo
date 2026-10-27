import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ListItemProps } from './types';

/** Row with a title, optional subtitle and leading/trailing content; pressable with `onPress`. */
export function ListItem({
  title,
  subtitle,
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
    <>
      {left}
      <View style={styles.body}>
        <Text testID={testID ? `${testID}.title` : undefined} variant="body">
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text
            testID={testID ? `${testID}.subtitle` : undefined}
            variant="bodySmall"
            color="textSecondary"
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right ??
        (shouldShowChevron && onPress !== undefined && (
          <View style={styles.chevron}>
            <Icon name="chevron-right" size={20} color="textSecondary" />
          </View>
        ))}
    </>
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
