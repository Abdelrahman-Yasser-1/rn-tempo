import { StyleSheet } from 'react-native-unistyles';

import type { RadiusKey } from '@theme/tokens';

export const styles = StyleSheet.create((theme) => ({
  bone: (width: number | `${number}%`, height: number, radius: RadiusKey) => ({
    width,
    height,
    overflow: 'hidden' as const,
    borderRadius: theme.radii[radius],
    backgroundColor: theme.colors.skeletonBase,
  }),
}));
