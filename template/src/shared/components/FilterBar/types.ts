import type { IconName } from '@assets/generated/icons.types';

export type FilterOption = Readonly<{
  key: string;
  label: string;
  icon?: IconName;
}>;

export type FilterBarProps = Readonly<{
  /** Quick filters shown as chips in a horizontal list. */
  filters: readonly FilterOption[];
  /** Keys of the selected filters. */
  selected: readonly string[];
  onToggle: (key: string) => void;
  /** Shows the filter button at the start of the row; it opens the full filter UI. */
  onFilterPress?: () => void;
  /** Number of active filters, shown as a badge on the filter button (hidden at 0). */
  filterCount?: number;
  testID?: string;
}>;
