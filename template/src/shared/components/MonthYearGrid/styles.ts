import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

import { YEAR_ROW_HEIGHT } from './useMonthYearGrid';

const MONTH_ROWS = 4;

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  months: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthSlot: {
    width: '33.33%',
    padding: theme.spacing.xxs,
  },
  years: {
    width: theme.spacing.xxxl + theme.spacing.xl,
    height: YEAR_ROW_HEIGHT * MONTH_ROWS,
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: theme.colors.divider,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET - theme.spacing.xs,
    borderRadius: theme.radii.sm,
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.primary },
        false: {},
      },
      current: {
        true: { backgroundColor: theme.colors.primaryContainer },
        false: {},
      },
      disabled: {
        true: { opacity: 0.4 },
        false: {},
      },
    },
  },
  yearRow: {
    height: YEAR_ROW_HEIGHT,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xxs,
  },
}));
