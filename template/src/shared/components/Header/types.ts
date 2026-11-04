import type { IconName } from '@assets/generated/icons.types';

export type HeaderVariant = 'default' | 'transparent' | 'onColor';

export type HeaderAction = Readonly<{
  icon: IconName;
  /** Required: an icon alone has no accessible name. */
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}>;

export type HeaderProps = Readonly<{
  title?: string;
  /** Second line under the title. */
  subtitle?: string;
  /** Shows a back button that calls this. Its chevron follows the layout direction. */
  onBack?: () => void;
  /** Overrides the translated "Back" label of the back button. */
  backLabel?: string;
  /** Trailing icon buttons; at most three are shown. */
  actions?: readonly HeaderAction[];
  /**
   * `default` sits on the screen background, `transparent` has no background (over media), and
   * `onColor` is a primary-coloured bar with `onPrimary` content.
   */
  variant?: HeaderVariant;
  testID?: string;
}>;
