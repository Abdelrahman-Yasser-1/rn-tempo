import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  header: {
    minHeight: MIN_TOUCH_TARGET + theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    variants: {
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
  },
  titles: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  panel: {
    overflow: 'hidden',
  },
  measure: {
    position: 'absolute',
    start: 0,
    end: 0,
    top: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
}));
