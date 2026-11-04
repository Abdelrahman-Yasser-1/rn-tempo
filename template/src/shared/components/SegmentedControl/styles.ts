import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const SEGMENT_INSET = 4;

export const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: 'row',
    padding: SEGMENT_INSET,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceVariant,
  },
  thumb: {
    position: 'absolute',
    top: SEGMENT_INSET,
    bottom: SEGMENT_INSET,
    start: SEGMENT_INSET,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.background,
    boxShadow: theme.shadows.sm.boxShadow,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
}));
