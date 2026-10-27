import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
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
  body: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  chevron: {
    transform: [{ scaleX: rt.rtl ? -1 : 1 }],
  },
}));
