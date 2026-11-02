import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
}));
