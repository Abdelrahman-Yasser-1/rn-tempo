import type { ColorTokens } from '@theme/tokens';

export type LoaderSize = 'sm' | 'lg';
export type LoaderVariant = 'inline' | 'overlay';

export type LoaderProps = Readonly<{
  size?: LoaderSize;
  /** Spinner color token; defaults to `primary`. */
  color?: keyof ColorTokens;
  /** Visible caption under the spinner; also the accessibility label. */
  label?: string;
  /**
   * `inline` sits in the layout. `overlay` covers the parent (mount it as the last child of the
   * screen) with the scrim colour, blocks touches and is announced as a modal.
   */
  variant?: LoaderVariant;
  testID?: string;
}>;
