import type { ReactNode } from 'react';

import type { HeaderProps } from '@shared/components/Header';
import type { SpacingKey } from '@theme/tokens';

export type ScreenLayoutProps = Readonly<{
  /** Props of the Header at the top; omit for a screen without a header. */
  header?: HeaderProps;
  /** `true` scrolls the content (the footer stays pinned); `false` lays it out in a flex View. */
  scroll?: boolean;
  /** Sticky area under the content for primary actions; sits above the bottom safe-area inset. */
  footer?: ReactNode;
  /** Fades and slides the content in on mount. Skipped when reduced motion is on. */
  animated?: boolean;
  /** Keeps the focused field above the keyboard (see Screen). */
  keyboardAware?: boolean;
  /** Padding of the content as a spacing token; defaults to `xl`. */
  padding?: SpacingKey;
  /** Screen root testID, `<screen-kebab>-screen` (C14). The header, content and footer add suffixes. */
  testID?: string;
  children?: ReactNode;
}>;
