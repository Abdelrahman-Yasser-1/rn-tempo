import type { RadiusKey } from '@theme/tokens';

export type BoneProps = Readonly<{
  /** Points or a percentage of the parent; defaults to 100%. */
  width?: number | `${number}%`;
  /** Points or a percentage of the parent; defaults to 14. */
  height?: number | `${number}%`;
  /** Corner radius token; defaults to `md`. */
  radius?: RadiusKey;
  testID?: string;
}>;
