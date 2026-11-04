import type { ReactNode } from 'react';

import type { IconName } from '@assets/generated/icons.types';

export type EmptyStateProps = Readonly<{
  icon?: IconName;
  /** Custom artwork above the title; replaces the icon when given. */
  illustration?: ReactNode;
  title: string;
  message?: string;
  /** Label of the optional call-to-action button. */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}>;
