import type { ReactNode } from 'react';

export type PickerSheetProps = Readonly<{
  visible: boolean;
  /** Called after the sheet is dismissed by any means: swipe, backdrop, close, Cancel or Confirm. */
  onClose: () => void;
  title: string;
  /**
   * Adds a footer with Cancel and Confirm. Confirm calls this, then closes the sheet; without it
   * the sheet has no footer and the content decides when to close.
   */
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  /** Fixed snap points such as `['60%']`; omit to size the sheet to its content. */
  snapPoints?: readonly (string | number)[];
  children?: ReactNode;
  /** Applied to the content; the parts add suffixes (`.close`, `.cancel`, `.confirm`). */
  testID?: string;
}>;
