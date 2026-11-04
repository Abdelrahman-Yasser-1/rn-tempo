import type { IconName } from '@assets/generated/icons.types';

export type SegmentItem = Readonly<{
  key: string;
  label: string;
  icon?: IconName;
}>;

export type SegmentedControlProps = Readonly<{
  /** Two to four segments; extras past four are ignored. They share the width equally. */
  items: readonly SegmentItem[];
  /** Key of the selected segment. */
  value: string;
  onChange: (key: string) => void;
  /** Applied to the track; segments add `.${key}`. */
  testID?: string;
}>;
