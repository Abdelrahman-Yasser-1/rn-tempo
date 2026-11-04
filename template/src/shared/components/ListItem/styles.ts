import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    variants: {
      divider: {
        true: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.divider,
        },
        false: {},
      },
    },
  },
}));
