import { StyleSheet } from 'react-native-unistyles';

const SIZES = { sm: 32, md: 40, lg: 56, xl: 80 } as const;

export const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryContainer,
    variants: {
      size: {
        sm: { width: SIZES.sm, height: SIZES.sm },
        md: { width: SIZES.md, height: SIZES.md },
        lg: { width: SIZES.lg, height: SIZES.lg },
        xl: { width: SIZES.xl, height: SIZES.xl },
      },
    },
  },
}));

export const AVATAR_SIZES = SIZES;
