import type { ReactNode } from 'react';

import type { ColorTokens } from '@theme/tokens';

export type LinkVariant = 'underline' | 'plain';

export type LinkProps = Readonly<{
  /** Visible link text. */
  children: ReactNode;
  /** Called on press. Runs before `href` is opened when both are given. */
  onPress?: () => void;
  /** Opened through `openUrlSafe` on press. */
  href?: string;
  /** `underline` (default) draws a line under the text; `plain` is colour only. */
  variant?: LinkVariant;
  /** Color token; defaults to `primary`. */
  color?: keyof ColorTokens;
  /**
   * Render as nested text so the link can sit in the middle of a sentence. Inline links are as
   * tall as the line, so they cannot offer a 44 pt target; keep them out of dense UI.
   */
  inline?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}>;
