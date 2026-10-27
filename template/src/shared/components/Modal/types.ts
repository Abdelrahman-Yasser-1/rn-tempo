import type { ReactNode } from 'react';

export type ModalProps = Readonly<{
  visible: boolean;
  /** Called on backdrop press and the Android back button (when `dismissable`). */
  onClose: () => void;
  /** Heading shown at the top of the panel and used as its accessibility label. */
  title?: string;
  /** When false, the backdrop and back button do nothing; use for blocking flows. */
  dismissable?: boolean;
  children?: ReactNode;
  testID?: string;
}>;
