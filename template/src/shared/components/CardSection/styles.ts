import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    variants: {
      padding: {
        none: { padding: theme.spacing.none },
        sm: { padding: theme.spacing.sm },
        md: { padding: theme.spacing.md },
        lg: { padding: theme.spacing.lg },
        xl: { padding: theme.spacing.xl },
      },
      divider: {
        true: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
        false: {},
      },
    },
  },
}));
