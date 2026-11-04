import type { ReactNode } from 'react';

import type { CardPadding } from '../Card';

export type CardSectionProps = Readonly<{
  /** Draws a divider line above the section, to separate it from the one before. */
  divider?: boolean;
  /** Padding token; defaults to `lg`. */
  padding?: CardPadding;
  children?: ReactNode;
  testID?: string;
}>;
