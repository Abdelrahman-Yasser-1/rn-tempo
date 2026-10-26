import type { ColorTokens, SpacingKey } from '@theme/tokens';

export type DividerProps = Readonly<{
  orientation?: 'horizontal' | 'vertical';
  /** Color token; defaults to `divider`. */
  color?: keyof ColorTokens;
  /** Margin along the divider's cross axis, as a spacing token. */
  spacing?: SpacingKey;
  testID?: string;
}>;
