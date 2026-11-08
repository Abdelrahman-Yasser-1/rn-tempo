import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';

import type {
  ListItemLayout,
  ListItemLeading,
  ListItemTrailing,
} from '@shared/components/ListItemContent';

export type ListItemProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> & {
    title: string;
    subtitle?: string;
    /** Small secondary text under the subtitle (beside the title in the `inline` layout). */
    meta?: string;
    /** `default`, `stacked` (leading slot above the text) or `inline` (title and meta on one line). */
    layout?: ListItemLayout;
    /** Typed leading slot: an icon, avatar or image. */
    leading?: ListItemLeading;
    /** Typed trailing slot: chevron, switch, text or badge. Don't combine a switch with `onPress`. */
    trailing?: ListItemTrailing;
    /** Leading content, usually an Icon or Avatar. Overrides `leading`. */
    left?: ReactNode;
    /** Trailing content (a Badge, a Switch, text). Replaces the chevron and overrides `trailing`. */
    right?: ReactNode;
    /** Shows a trailing chevron that points to the end side in RTL too. Needs `onPress`. */
    showChevron?: boolean;
    /** Draws a hairline under the row. */
    showDivider?: boolean;
  }
>;
