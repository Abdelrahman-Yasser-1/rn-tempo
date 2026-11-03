import type { IconName } from '@assets/generated/icons.types';

export type EmptyStateProps = Readonly<{
  icon?: IconName;
  title: string;
  message?: string;
  /** Label of the optional call-to-action button. */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}>;
