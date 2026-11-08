import { Pressable, ScrollView, View } from 'react-native';

import { Badge } from '@shared/components/Badge';
import { Icon } from '@shared/components/Icon';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { TabItem, TabsProps } from './types';
import { useTabs } from './useTabs';

type TabProps = Readonly<{
  item: TabItem;
  variant: NonNullable<TabsProps['variant']>;
  isSelected: boolean;
  testID?: string;
  onPress: () => void;
  onLayout: Parameters<typeof Pressable>[0]['onLayout'];
}>;

function Tab({ item, variant, isSelected, testID, onPress, onLayout }: TabProps) {
  styles.useVariants({ variant, selected: isSelected });
  let color: 'textSecondary' | 'primary' | 'onPrimaryContainer' = 'textSecondary';
  if (isSelected) {
    color = variant === 'pill' ? 'onPrimaryContainer' : 'primary';
  }
  const badgeText = item.badge === undefined ? undefined : String(item.badge);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={badgeText === undefined ? item.label : `${item.label}, ${badgeText}`}
      accessibilityState={{ selected: isSelected }}
      testID={testID}
      style={styles.tab}
      onPress={onPress}
      onLayout={onLayout}
    >
      {item.icon !== undefined && <Icon name={item.icon} size="md" color={color} />}
      <Text variant="label" color={color}>
        {item.label}
      </Text>
      {badgeText !== undefined && (
        <Badge
          label={badgeText}
          size="sm"
          variant={isSelected ? 'primary' : 'neutral'}
          testID={testID ? `${testID}.badge` : undefined}
        />
      )}
    </Pressable>
  );
}

/**
 * Row of tabs (`underline` or `pill`) that scrolls when it overflows and reads right to left in
 * Arabic. Controlled by `value`/`onChange`; rendering the selected tab's content is up to the caller.
 */
export function Tabs({ items, value, onChange, variant = 'underline', testID }: TabsProps) {
  const { scrollRef, onTabLayout } = useTabs({ items, value });
  styles.useVariants({ variant });

  return (
    <View accessibilityRole="tablist" testID={testID}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {items.map((item) => (
          <Tab
            key={item.key}
            item={item}
            variant={variant}
            isSelected={item.key === value}
            testID={testID ? `${testID}.${item.key}` : undefined}
            onPress={() => {
              onChange(item.key);
            }}
            onLayout={(event) => {
              onTabLayout(item.key, event);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
