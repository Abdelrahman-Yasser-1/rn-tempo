import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  cell: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.primary },
        false: { backgroundColor: 'transparent' },
      },
    },
  },
}));
