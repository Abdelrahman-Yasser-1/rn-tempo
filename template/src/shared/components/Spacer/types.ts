import type { SpacingKey } from '@theme/tokens';

export type SpacerProps = Readonly<{
  /** Spacing token; defaults to `md`. */
  size?: SpacingKey;
  /** Spaces along the horizontal axis (inside a Row) instead of the vertical one. */
  horizontal?: boolean;
  testID?: string;
}>;
