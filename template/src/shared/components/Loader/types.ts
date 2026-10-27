import type { ColorTokens } from '@theme/tokens';

export type LoaderSize = 'sm' | 'lg';

export type LoaderProps = Readonly<{
  size?: LoaderSize;
  /** Spinner color token; defaults to `primary`. */
  color?: keyof ColorTokens;
  /** Visible caption under the spinner; also the accessibility label. */
  label?: string;
  /** Fills and centers within the parent. */
  fullScreen?: boolean;
  testID?: string;
}>;
