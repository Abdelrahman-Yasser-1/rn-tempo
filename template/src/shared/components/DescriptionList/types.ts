import type { ReactNode } from 'react';

import type { KeyValueLayout } from '../KeyValueRow';

export type DescriptionItem = Readonly<{
  key: string;
  label: string;
  value: ReactNode;
}>;

export type DescriptionListProps = Readonly<{
  items: readonly DescriptionItem[];
  layout?: KeyValueLayout;
  /** Hairline between rows. Defaults to `true`. */
  dividers?: boolean;
  /** Applied to the list; rows use `${testID}.${key}`. */
  testID?: string;
}>;
