import type { IconName } from '@assets/generated/icons.types';

export type FabProps = Readonly<{
  icon: IconName;
  /** Extended button: shows the label next to the icon. Without it the Fab is a round icon button. */
  label?: string;
  /** Required when there is no `label`: an icon alone has no accessible name. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Mount/unmount switch, e.g. from `useScrollToTop`. Defaults to `true`. */
  visible?: boolean;
  testID?: string;
}>;
