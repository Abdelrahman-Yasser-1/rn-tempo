import type { ReactNode } from 'react';

export type HeaderProps = Readonly<{
  title?: string;
  /** Shows a back button that calls this. Its chevron follows the layout direction. */
  onBack?: () => void;
  /** Overrides the translated "Back" label of the back button. */
  backLabel?: string;
  /** Trailing actions, usually one or two `IconButton`s. */
  right?: ReactNode;
  testID?: string;
}>;
