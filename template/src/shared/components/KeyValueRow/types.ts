import type { ReactNode } from 'react';

export type KeyValueLayout = 'horizontal' | 'vertical';

export type KeyValueRowProps = Readonly<{
  label: string;
  /** Plain text, or any node (a badge, a link) for richer values. */
  value: ReactNode;
  /**
   * `horizontal` puts the label at the start and the value at the end; `vertical` stacks the
   * value under the label. Defaults to `horizontal`.
   */
  layout?: KeyValueLayout;
  testID?: string;
}>;
