import type { ReactNode } from 'react';

export type BottomSheetProps = Readonly<{
  visible: boolean;
  /** Called after the sheet is dismissed by a swipe, a backdrop press or the close button. */
  onClose: () => void;
  /** Renders a header with a close button. */
  title?: string;
  /** Pinned under the content, above the safe area; typically the sheet's action buttons. */
  footer?: ReactNode;
  /** Fixed snap points such as `['50%']`. Omit to size the sheet to its content. */
  snapPoints?: readonly (string | number)[];
  children?: ReactNode;
  testID?: string;
}>;
