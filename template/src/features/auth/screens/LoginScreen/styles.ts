import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  links: {
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
}));
