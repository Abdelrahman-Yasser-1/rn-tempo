import type { RadiusKey } from '@theme/tokens';

export type BoneProps = Readonly<{
  /** Points or a percentage of the parent; defaults to 100%. */
  width?: number | `${number}%`;
  height?: number;
  /** Corner radius token; defaults to `md`. */
  radius?: RadiusKey;
  testID?: string;
}>;
