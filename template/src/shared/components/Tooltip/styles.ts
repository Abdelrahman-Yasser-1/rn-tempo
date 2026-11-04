import { StyleSheet } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';

export { HIT_SLOP };

export const styles = StyleSheet.create((theme) => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  column: (width: number, startOffset: number, top?: number, bottom?: number) => ({
    position: 'absolute' as const,
    width,
    marginStart: startOffset,
    top,
    bottom,
  }),
  hidden: {
    opacity: 0,
  },
  bubble: {
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.textPrimary,
  },
  arrow: (offset: number, isTop: boolean) => ({
    width: theme.spacing.md,
    height: theme.spacing.md,
    marginStart: offset,
    // Half of the rotated square tucks under the bubble; the other half is the pointer.
    marginTop: isTop ? -theme.spacing.sm : 0,
    marginBottom: isTop ? 0 : -theme.spacing.sm,
    backgroundColor: theme.colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  }),
}));
