import { StyleSheet } from 'react-native-unistyles';

import { px } from '@theme/index';

export const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
  },
  slide: (width: number) => ({
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
  }),
  iconCircle: {
    width: px(144),
    height: px(144),
    borderRadius: px(72),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  dot: (isActive: boolean) => ({
    width: px(isActive ? 24 : 8),
    height: px(8),
    borderRadius: px(4),
    backgroundColor: isActive ? theme.colors.primary : theme.colors.border,
  }),
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
}));
