import { StyleSheet } from 'react-native-unistyles';

const SIZE = 56;

export const styles = StyleSheet.create((theme) => ({
  root: (bottomInset: number) => ({
    position: 'absolute',
    end: theme.spacing.lg,
    bottom: bottomInset + theme.spacing.lg,
    zIndex: theme.zIndex.sticky,
  }),
  button: {
    minWidth: SIZE,
    height: SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.md,
    variants: {
      isExtended: {
        true: { paddingHorizontal: theme.spacing.xl },
        false: {},
      },
    },
  },
}));
