import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

const DAY_CIRCLE = MIN_TOUCH_TARGET - 4;

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  weekdays: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    alignItems: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  dayCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: DAY_CIRCLE,
    height: DAY_CIRCLE,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: 'transparent',
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        false: {},
      },
      today: {
        true: { borderColor: theme.colors.primary },
        false: {},
      },
    },
  },
}));
