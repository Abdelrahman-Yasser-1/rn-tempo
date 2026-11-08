import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@shared/components/Icon';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { AccordionItemProps } from './types';
import { useAccordionItem } from './useAccordionItem';

/** Collapsible section: a header button with a rotating chevron over an animated content panel. */
export function AccordionItem({
  title,
  subtitle,
  icon,
  expanded: isExpandedProp,
  defaultExpanded: isDefaultExpanded,
  onToggle,
  disabled: isDisabled = false,
  children,
  testID,
}: AccordionItemProps) {
  const { isExpanded, onPress, onContentLayout, panelStyle, chevronStyle } = useAccordionItem({
    expanded: isExpandedProp,
    defaultExpanded: isDefaultExpanded,
    onToggle,
    disabled: isDisabled,
  });
  styles.useVariants({ disabled: isDisabled });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle === undefined ? title : `${title}, ${subtitle}`}
        accessibilityState={{ expanded: isExpanded, disabled: isDisabled }}
        disabled={isDisabled}
        testID={testID}
        style={styles.header}
        onPress={onPress}
      >
        {icon !== undefined && <Icon name={icon} color="primary" />}
        <View style={styles.titles}>
          <Text testID={suffix('title')} variant="bodyStrong">
            {title}
          </Text>
          {subtitle !== undefined && subtitle !== '' && (
            <Text testID={suffix('subtitle')} variant="caption" color="textSecondary">
              {subtitle}
            </Text>
          )}
        </View>
        <Animated.View style={chevronStyle}>
          <Icon testID={suffix('chevron')} name="chevron-down" color="textSecondary" />
        </Animated.View>
      </Pressable>
      <Animated.View
        testID={suffix('content')}
        style={[styles.panel, panelStyle]}
        accessibilityElementsHidden={!isExpanded}
        importantForAccessibility={isExpanded ? 'auto' : 'no-hide-descendants'}
      >
        <View style={styles.measure} onLayout={onContentLayout}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}
