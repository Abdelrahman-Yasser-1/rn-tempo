import type { Source } from '@d11/react-native-fast-image';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = Readonly<{
  /** Remote image; initials from `name` show when absent or when loading fails. */
  source?: Source;
  /** Full name, used for the initials and as the default accessibility label. */
  name?: string;
  size?: AvatarSize;
  accessibilityLabel?: string;
  testID?: string;
}>;
