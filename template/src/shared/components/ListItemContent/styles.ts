import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.md,
    variants: {
      layout: {
        default: { flexDirection: 'row', alignItems: 'center' },
        inline: { flexDirection: 'row', alignItems: 'center' },
        stacked: { flexDirection: 'column', alignItems: 'flex-start' },
      },
    },
  },
  // The text column; in the stacked layout it spans the width under the leading slot.
  body: {
    gap: theme.spacing.xxs,
    variants: {
      layout: {
        default: { flex: 1 },
        inline: { flex: 1 },
        stacked: { alignSelf: 'stretch' },
      },
    },
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
}));
