import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  icon: {
    // Aligns the icon with the first line of the caption.
    paddingTop: theme.spacing.xxs,
  },
  text: {
    flex: 1,
  },
}));
