import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';

export type ListItemProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> & {
    title: string;
    subtitle?: string;
    /** Leading content, usually an Icon or Avatar. */
    left?: ReactNode;
    /** Trailing content (a Badge, a Switch, text). Replaces the chevron. */
    right?: ReactNode;
    /** Shows a trailing chevron that points to the end side in RTL too. Needs `onPress`. */
    showChevron?: boolean;
    /** Draws a hairline under the row. */
    showDivider?: boolean;
  }
>;
