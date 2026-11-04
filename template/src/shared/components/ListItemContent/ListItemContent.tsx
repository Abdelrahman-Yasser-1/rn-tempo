import { View } from 'react-native';

import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { Icon } from '../Icon';
import { Image } from '../Image';
import { Switch } from '../Switch';
import { Text } from '../Text';

import { styles } from './styles';
import type { ListItemContentProps, ListItemLeading, ListItemTrailing } from './types';

const MEDIA_SIZE = 48;

type SlotProps<TSlot> = Readonly<{ slot: TSlot; title: string; testID?: string }>;

function Leading({ slot, testID }: SlotProps<ListItemLeading>) {
  switch (slot.type) {
    case 'icon':
      return <Icon name={slot.name} testID={testID} color="primary" />;
    case 'avatar':
      return <Avatar name={slot.name} source={slot.source} testID={testID} />;
    case 'image':
      return (
        <Image
          testID={testID}
          source={slot.source}
          accessibilityLabel={slot.accessibilityLabel}
          width={MEDIA_SIZE}
          height={MEDIA_SIZE}
          radius="md"
        />
      );
  }
}

function Trailing({ slot, title, testID }: SlotProps<ListItemTrailing>) {
  switch (slot.type) {
    case 'chevron':
      return <Icon name="chevron-right" size="md" color="textSecondary" testID={testID} />;
    case 'switch':
      return (
        <Switch
          testID={testID}
          accessibilityLabel={title}
          value={slot.value}
          onValueChange={slot.onValueChange}
          disabled={slot.disabled}
        />
      );
    case 'text':
      return (
        <Text testID={testID} variant="bodySmall" color="textSecondary">
          {slot.text}
        </Text>
      );
    case 'badge':
      return <Badge testID={testID} label={slot.label} count={slot.count} variant={slot.variant} />;
  }
}

/**
 * The inside of a list row: leading slot (icon, avatar or image), title with subtitle and meta
 * in one of three layouts, and a trailing slot (chevron, switch, text or badge). `ListItem` wraps
 * it with press handling; use it directly to build custom rows. A `switch` trailing slot is its
 * own touchable, so don't put the row inside a pressable.
 */
export function ListItemContent({
  title,
  subtitle,
  meta,
  layout = 'default',
  leading,
  trailing,
  left,
  right,
  testID,
  partsTestID = testID,
}: ListItemContentProps) {
  // `default` is Unistyles' fallback variant, selected by passing nothing.
  styles.useVariants({ layout: layout === 'default' ? undefined : layout });
  const suffix = (part: string) => (partsTestID ? `${partsTestID}.${part}` : undefined);
  const hasMeta = meta !== undefined && meta !== '';
  const isInline = layout === 'inline';
  const metaNode = hasMeta && (
    <Text testID={suffix('meta')} variant="caption" color="textSecondary">
      {meta}
    </Text>
  );

  return (
    <View testID={testID} style={styles.root}>
      {left ??
        (leading !== undefined && (
          <Leading slot={leading} title={title} testID={suffix('leading')} />
        ))}
      <View style={styles.body}>
        <View style={isInline ? styles.headline : undefined}>
          <Text testID={suffix('title')} variant="body" style={styles.title}>
            {title}
          </Text>
          {isInline && metaNode}
        </View>
        {subtitle !== undefined && (
          <Text testID={suffix('subtitle')} variant="bodySmall" color="textSecondary">
            {subtitle}
          </Text>
        )}
        {!isInline && metaNode}
      </View>
      {right ??
        (trailing !== undefined && (
          <Trailing slot={trailing} title={title} testID={suffix('trailing')} />
        ))}
    </View>
  );
}
