import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  label: {
    flexShrink: 1,
  },
  // The native slider mirrors itself in RTL, so the minimum sits at the start edge.
  slider: {
    width: '100%',
    height: MIN_TOUCH_TARGET,
    variants: {
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
  },
  range: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
}));
