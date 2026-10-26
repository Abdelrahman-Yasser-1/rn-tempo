import type { ImageStyle, ResizeMode, Source } from '@d11/react-native-fast-image';
import type { ReactNode } from 'react';
import type { ImageRequireSource, StyleProp } from 'react-native';

import type { RadiusKey } from '@theme/tokens';

export type ImageProps = Readonly<{
  /** Remote `{ uri }` source or a bundled `require`d asset. */
  source: Source | ImageRequireSource;
  /** Required for informative images; omit for decorative ones (hidden from screen readers). */
  accessibilityLabel?: string;
  width?: number;
  height?: number;
  /** Corner radius token. */
  radius?: RadiusKey;
  resizeMode?: ResizeMode;
  /** Replaces the default fallback shown when loading fails. */
  fallback?: ReactNode;
  style?: StyleProp<ImageStyle>;
  testID?: string;
}>;
