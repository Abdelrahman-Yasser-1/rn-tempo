import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.md,
  },
  action: {
    alignItems: 'flex-start',
  },
}));
