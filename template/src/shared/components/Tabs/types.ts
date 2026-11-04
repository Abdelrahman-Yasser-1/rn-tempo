import type { IconName } from '@assets/generated/icons.types';

export type TabItem = Readonly<{
  key: string;
  label: string;
  icon?: IconName;
  /** Count or short text shown in a badge after the label. */
  badge?: number | string;
}>;

export type TabsVariant = 'underline' | 'pill';

export type TabsProps = Readonly<{
  items: readonly TabItem[];
  /** Key of the selected tab. */
  value: string;
  onChange: (key: string) => void;
  variant?: TabsVariant;
  /** Rendering the selected tab's content is the caller's job. */
  testID?: string;
}>;
