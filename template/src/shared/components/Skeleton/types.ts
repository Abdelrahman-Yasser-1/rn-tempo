import type { ReactNode } from 'react';

export type SkeletonProps = Readonly<{
  /** Accessibility label announced for the whole placeholder; defaults to a translated "Loading". */
  accessibilityLabel?: string;
  children?: ReactNode;
  testID?: string;
}>;
