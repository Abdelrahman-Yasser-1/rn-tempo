import { StyleSheet } from 'react-native-unistyles';

import type { RadiusKey } from '@theme/tokens';

type Frame = { width?: number; height?: number; radius?: RadiusKey };

export const styles = StyleSheet.create((theme) => ({
  container: (frame: Frame) => ({
    width: frame.width,
    height: frame.height,
    borderRadius: frame.radius ? theme.radii[frame.radius] : undefined,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surfaceVariant,
  }),
  image: {
    width: '100%' as const,
    height: '100%' as const,
  },
  fallback: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
}));
