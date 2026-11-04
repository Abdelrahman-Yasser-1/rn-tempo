import { StyleSheet } from 'react-native-unistyles';

const CIRCLE = 28;
const CONNECTOR_HEIGHT = 2;
const BAR_HEIGHT = 8;

export const styles = StyleSheet.create((theme) => ({
  numbered: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  connector: (isFilled: boolean, isHidden: boolean) => {
    let backgroundColor = theme.colors.border;
    if (isHidden) {
      backgroundColor = 'transparent';
    } else if (isFilled) {
      backgroundColor = theme.colors.primary;
    }
    return { flex: 1, height: CONNECTOR_HEIGHT, backgroundColor };
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
    borderWidth: 2,
    variants: {
      status: {
        done: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
        current: { borderColor: theme.colors.primary, backgroundColor: theme.colors.background },
        upcoming: { borderColor: theme.colors.border, backgroundColor: theme.colors.background },
      },
    },
  },
  label: {
    paddingHorizontal: theme.spacing.xxs,
  },
  progress: {
    gap: theme.spacing.sm,
  },
  bar: {
    height: BAR_HEIGHT,
    overflow: 'hidden',
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceVariant,
  },
  fill: (ratio: number) => ({
    width: `${String(Math.round(ratio * 100))}%`,
    height: BAR_HEIGHT,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  }),
}));
