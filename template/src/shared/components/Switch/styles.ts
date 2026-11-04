import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
    variants: {
      labelPosition: {
        start: { justifyContent: 'space-between' },
        end: { justifyContent: 'flex-start' },
      },
    },
  },
  label: {
    flexShrink: 1,
  },
  track: {
    width: theme.spacing.xxxl,
    height: theme.spacing.xl + theme.spacing.xs,
    padding: theme.spacing.xxs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.border,
    // flex-start is the start edge in both LTR and RTL, so the thumb mirrors automatically.
    justifyContent: 'center',
    variants: {
      value: {
        true: { backgroundColor: theme.colors.primary },
        false: {},
      },
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
  },
  thumb: {
    width: theme.spacing.xl,
    height: theme.spacing.xl,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.background,
    variants: {
      value: {
        true: { alignSelf: 'flex-end' },
        false: { alignSelf: 'flex-start' },
      },
    },
  },
}));
