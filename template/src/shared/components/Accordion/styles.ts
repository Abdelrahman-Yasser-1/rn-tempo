import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
}));
