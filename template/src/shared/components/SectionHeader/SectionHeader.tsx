import { View } from 'react-native';

import { Link } from '@shared/components/Link';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { SectionHeaderProps } from './types';

/** Heading of a screen section with an optional subtitle and an action link such as "See all". */
export function SectionHeader({ title, subtitle, action, testID }: SectionHeaderProps) {
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.titles}>
        <Text testID={suffix('title')} variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== '' && (
          <Text testID={suffix('subtitle')} variant="bodySmall" color="textSecondary">
            {subtitle}
          </Text>
        )}
      </View>
      {action !== undefined && (
        <Link testID={suffix('action')} href={action.href} onPress={action.onPress}>
          {action.label}
        </Link>
      )}
    </View>
  );
}
