import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    variants: {
      fullScreen: {
        true: { flex: 1, alignSelf: 'stretch' },
        false: {},
      },
    },
  },
}));
