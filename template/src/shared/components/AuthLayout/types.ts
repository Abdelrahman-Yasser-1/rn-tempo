import type { ReactNode } from 'react';

export type AuthLayoutProps = Readonly<{
  /** Shows a Header above the title with this text (the back button needs `onBack`). */
  headerTitle?: string;
  /** Back button of the Header; screens that are the stack root leave it out. */
  onBack?: () => void;
  /** Logo or illustration shown above the title. */
  logo?: ReactNode;
  title: string;
  subtitle?: string;
  /** Form fields and buttons; stacked with the layout's gap. */
  children?: ReactNode;
  /** Secondary links or hints under the content. */
  footer?: ReactNode;
  /** Screen root testID, `<screen-kebab>-screen` (C14); the header gets `<screen-kebab>.header`. */
  testID?: string;
}>;
