import { Pressable, View } from 'react-native';

import { Avatar } from '@shared/components/Avatar';
import { Text } from '@shared/components/Text';
import { HIT_SLOP } from '@shared/constants/touch';

import { styles } from './styles';
import type { UserCardProps } from './types';

/** Avatar with a name, meta lines and a trailing slot; a button when `onPress` is given. */
export function UserCard({
  name,
  meta = [],
  avatarSource,
  trailing,
  onPress,
  accessibilityLabel,
  testID,
}: UserCardProps) {
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const body = (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar testID={suffix('avatar')} name={name} source={avatarSource} size="lg" />
      </View>
      <View style={styles.texts}>
        <Text testID={suffix('name')} variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        {meta.map((line) => (
          <Text key={line} variant="caption" color="textSecondary" numberOfLines={1}>
            {line}
          </Text>
        ))}
      </View>
      {trailing}
    </>
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} style={styles.root}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [name, ...meta].join(', ')}
      hitSlop={HIT_SLOP}
      testID={testID}
      style={styles.root}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
