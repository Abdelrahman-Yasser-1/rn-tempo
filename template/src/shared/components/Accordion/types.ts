import type { ReactNode } from 'react';

import type { IconName } from '@assets/generated/icons.types';

export type AccordionEntry = Readonly<{
  key: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
  disabled?: boolean;
  content: ReactNode;
}>;

export type AccordionProps = Readonly<{
  items: readonly AccordionEntry[];
  /** Lets several items stay open together; by default opening one closes the others. */
  allowMultiple?: boolean;
  /** Keys open at first when uncontrolled. */
  defaultExpandedKeys?: readonly string[];
  /** Controlled open keys. Pair it with `onChange`. */
  expandedKeys?: readonly string[];
  /** Called with the next open keys. */
  onChange?: (keys: readonly string[]) => void;
  /** Applied to the group; each item uses `${testID}.${key}`. */
  testID?: string;
}>;
