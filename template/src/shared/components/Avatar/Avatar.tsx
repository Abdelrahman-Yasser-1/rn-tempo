import { View } from 'react-native';

import { initials } from '@shared/utils';

import { Image } from '../Image';
import { Text } from '../Text';

import { AVATAR_SIZES, styles } from './styles';
import type { AvatarProps } from './types';

/** Round avatar: the image when it loads, otherwise the initials of `name`. */
export function Avatar({ source, name, size = 'md', accessibilityLabel, testID }: AvatarProps) {
  const label = accessibilityLabel ?? name;
  const shouldShowImage = source !== undefined;
  styles.useVariants({ size });

  return (
    <View
      accessible={label !== undefined}
      accessibilityRole={label === undefined ? undefined : 'image'}
      accessibilityLabel={label}
      testID={testID}
      style={styles.root}
    >
      {shouldShowImage ? (
        <Image
          testID={testID ? `${testID}.image` : undefined}
          source={source}
          width={AVATAR_SIZES[size]}
          height={AVATAR_SIZES[size]}
          fallback={<AvatarInitials name={name} testID={testID} />}
        />
      ) : (
        <AvatarInitials name={name} testID={testID} />
      )}
    </View>
  );
}

function AvatarInitials({ name, testID }: Readonly<{ name?: string; testID?: string }>) {
  return (
    <Text
      testID={testID ? `${testID}.initials` : undefined}
      variant="label"
      color="onPrimaryContainer"
      importantForAccessibility="no"
    >
      {name === undefined ? '' : initials(name)}
    </Text>
  );
}
