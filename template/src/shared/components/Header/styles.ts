import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + theme.spacing.md,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    variants: {
      variant: {
        default: { backgroundColor: theme.colors.background },
        transparent: { backgroundColor: 'transparent' },
        onColor: { backgroundColor: theme.colors.primary },
      },
    },
  },
  slot: {
    minWidth: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
  },
  end: {
    justifyContent: 'flex-end',
  },
  titles: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    alignSelf: 'stretch',
  },
}));
