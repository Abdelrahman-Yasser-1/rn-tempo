import type { ReactNode } from 'react';

import type { IconName } from '@assets/generated/icons.types';

import type { AvatarProps } from '../Avatar';
import type { BadgeVariant } from '../Badge';
import type { ImageProps } from '../Image';

/**
 * `default`: the text column beside the leading slot. `stacked`: the leading slot above the
 * text. `inline`: the title and `meta` share the first line, the subtitle sits below.
 */
export type ListItemLayout = 'default' | 'stacked' | 'inline';

export type ListItemLeading =
  | Readonly<{ type: 'icon'; name: IconName }>
  | Readonly<{ type: 'avatar'; name?: string; source?: NonNullable<AvatarProps['source']> }>
  | Readonly<{ type: 'image'; source: ImageProps['source']; accessibilityLabel?: string }>;

export type ListItemTrailing =
  | Readonly<{ type: 'chevron' }>
  | Readonly<{
      type: 'switch';
      value: boolean;
      onValueChange: (value: boolean) => void;
      disabled?: boolean;
    }>
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'badge'; label?: string; count?: number; variant?: BadgeVariant }>;

export type ListItemContentProps = Readonly<{
  title: string;
  subtitle?: string;
  /** Small secondary text: under the subtitle, or beside the title for the `inline` layout. */
  meta?: string;
  layout?: ListItemLayout;
  leading?: ListItemLeading;
  trailing?: ListItemTrailing;
  /** Custom leading node; takes precedence over `leading`. */
  left?: ReactNode;
  /** Custom trailing node; takes precedence over `trailing`. */
  right?: ReactNode;
  testID?: string;
  /** Prefix of the part ids (`.title`, `.subtitle`, ...); defaults to `testID`. */
  partsTestID?: string;
}>;
