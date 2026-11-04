import type { ReactNode } from 'react';

import type { IconName } from '@assets/generated/icons.types';

export type AccordionItemProps = Readonly<{
  title: string;
  subtitle?: string;
  /** Leading icon in front of the title. */
  icon?: IconName;
  /** Controlled expanded state. Pair it with `onToggle`. */
  expanded?: boolean;
  /** Initial state when uncontrolled. */
  defaultExpanded?: boolean;
  /** Called with the next expanded state when the header is pressed. */
  onToggle?: (isExpanded: boolean) => void;
  disabled?: boolean;
  /** Panel content, revealed with an animated height. */
  children?: ReactNode;
  /** Applied to the header; the parts add suffixes (`.title`, `.subtitle`, `.chevron`, `.content`). */
  testID?: string;
}>;
