import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@shared/components/Icon';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { TimelineItem, TimelineProps } from './types';

type StepProps = Readonly<{
  item: TimelineItem;
  isLast: boolean;
  testID?: string;
}>;

function Step({ item, isLast, testID }: StepProps) {
  const { t } = useTranslation();
  styles.useVariants({ status: item.status });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  // Literal keys, so the i18n extractor sees every one of them.
  let statusLabel = t(($) => $.timeline.upcoming);
  if (item.status === 'done') {
    statusLabel = t(($) => $.timeline.done);
  } else if (item.status === 'current') {
    statusLabel = t(($) => $.timeline.current);
  }
  const parts = [item.title, item.description, item.timestamp, statusLabel].filter(
    (part) => part !== undefined && part !== '',
  );

  return (
    <View accessible accessibilityLabel={parts.join(', ')} testID={testID} style={styles.item}>
      <View style={styles.rail}>
        <View style={styles.marker}>
          {item.status === 'done' && <Icon name="check" size="sm" color="onPrimary" />}
          {item.status === 'current' && <View style={styles.currentDot} />}
        </View>
        {!isLast && <View style={styles.connector} />}
      </View>
      <View style={[styles.content, isLast && styles.lastContent]}>
        <Text
          testID={suffix('title')}
          variant="bodyStrong"
          color={item.status === 'upcoming' ? 'textSecondary' : 'textPrimary'}
        >
          {item.title}
        </Text>
        {item.description !== undefined && item.description !== '' && (
          <Text testID={suffix('description')} variant="bodySmall" color="textSecondary">
            {item.description}
          </Text>
        )}
        {item.timestamp !== undefined && item.timestamp !== '' && (
          <Text testID={suffix('timestamp')} variant="caption" color="textSecondary">
            {item.timestamp}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Vertical list of steps joined by a connector; each step is `done`, `current` or `upcoming`. */
export function Timeline({ items, testID }: TimelineProps) {
  return (
    <View testID={testID}>
      {items.map((item, index) => (
        <Step
          key={item.key}
          item={item}
          isLast={index === items.length - 1}
          testID={testID ? `${testID}.${item.key}` : undefined}
        />
      ))}
    </View>
  );
}
