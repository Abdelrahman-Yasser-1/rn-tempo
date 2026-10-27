import type { IconName } from '@assets/icons';

export type EmptyStateProps = Readonly<{
  icon?: IconName;
  title: string;
  message?: string;
  /** Label of the optional call-to-action button. */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}>;
