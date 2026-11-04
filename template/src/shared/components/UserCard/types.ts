import type { Source } from '@d11/react-native-fast-image';
import type { ReactNode } from 'react';

export type UserCardProps = Readonly<{
  name: string;
  /** Lines under the name, e.g. a role and an email. */
  meta?: readonly string[];
  /** Remote avatar image; the initials of `name` show without it. */
  avatarSource?: Source;
  /** Content at the end of the card: a badge, a button, a chevron. */
  trailing?: ReactNode;
  /** Makes the whole card a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}>;
