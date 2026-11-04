import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme, rt) => ({
  root: {
    gap: theme.spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    variants: {
      open: {
        true: { borderColor: theme.colors.focus },
        false: {},
      },
      invalid: {
        true: { borderColor: theme.colors.error },
        false: {},
      },
      readOnly: {
        true: { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
        false: {},
      },
      disabled: {
        true: { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
        false: {},
      },
    },
  },
  // The chips and the trigger sit side by side, so no view overlaps the trigger (an overlay would
  // swallow its taps on Android). The trigger takes the rest of the row, including its own tap area.
  chips: {
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingStart: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  trigger: (hasChips: boolean) => ({
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: hasChips ? 'flex-end' : 'space-between',
    gap: theme.spacing.sm,
    minWidth: MIN_TOUCH_TARGET,
    paddingStart: hasChips ? theme.spacing.xs : theme.spacing.md,
    paddingEnd: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  }),
  summary: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  list: {
    paddingBottom: theme.spacing.xxl,
  },
  option: {
    paddingHorizontal: theme.spacing.lg,
  },
  description: {
    paddingStart: theme.spacing.xl + theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  footer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md + rt.insets.bottom,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
  },
  // Room under the last option for the footer that floats over the sheet.
  footerSpace: {
    height: MIN_TOUCH_TARGET + theme.spacing.xl + rt.insets.bottom,
  },
}));
