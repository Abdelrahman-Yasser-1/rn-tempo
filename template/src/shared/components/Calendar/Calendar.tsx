import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Box } from '@shared/components/Box';
import { Icon } from '@shared/components/Icon';
import { IconButton } from '@shared/components/IconButton';
import { MonthYearGrid } from '@shared/components/MonthYearGrid';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { CalendarProps } from './types';
import { useCalendar } from './useCalendar';

type DayCellProps = Readonly<{
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  isOutside: boolean;
  testID?: string;
  onPress: () => void;
}>;

function DayCell({
  label,
  accessibilityLabel,
  isSelected,
  isToday,
  isDisabled,
  isOutside,
  testID,
  onPress,
}: DayCellProps) {
  styles.useVariants({ selected: isSelected, today: isToday });
  let color: 'onPrimary' | 'textDisabled' | 'textSecondary' | 'textPrimary' = 'textPrimary';
  if (isSelected) {
    color = 'onPrimary';
  } else if (isDisabled) {
    color = 'textDisabled';
  } else if (isOutside) {
    color = 'textSecondary';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      testID={testID}
      disabled={isDisabled}
      style={styles.dayCell}
      onPress={onPress}
    >
      <Box style={styles.dayCircle}>
        <Text variant="body" color={color}>
          {label}
        </Text>
      </Box>
    </Pressable>
  );
}

/**
 * Month calendar for picking one day. Built on `Intl`, so month and weekday names, the first day
 * of the week and the right-to-left grid follow the app language. The title switches to a month
 * and year grid; the arrows step a month and stop at `minDate` / `maxDate`. Days travel as
 * `YYYY-MM-DD` strings.
 */
export function Calendar(props: CalendarProps) {
  const { t } = useTranslation();
  const vm = useCalendar(props);
  const { testID } = props;
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <Box testID={testID} style={styles.root}>
      <Box style={styles.header}>
        <IconButton
          testID={suffix('prev')}
          icon="chevron-left"
          size="sm"
          accessibilityLabel={t(($) => $.calendar.previousMonth)}
          disabled={vm.isPickingMonth || !vm.canGoPrevious}
          onPress={vm.onPrevious}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vm.title}
          accessibilityHint={t(($) => $.calendar.chooseMonthYear)}
          accessibilityState={{ expanded: vm.isPickingMonth }}
          testID={suffix('title')}
          style={styles.title}
          onPress={vm.onToggleMonthPicker}
        >
          <Text variant="bodyStrong">{vm.title}</Text>
          <Icon name="chevron-down" size="sm" color="textSecondary" />
        </Pressable>
        <IconButton
          testID={suffix('next')}
          icon="chevron-right"
          size="sm"
          accessibilityLabel={t(($) => $.calendar.nextMonth)}
          disabled={vm.isPickingMonth || !vm.canGoNext}
          onPress={vm.onNext}
        />
      </Box>
      {vm.isPickingMonth ? (
        <MonthYearGrid
          testID={suffix('months')}
          year={vm.year}
          month={vm.month}
          minMonth={vm.minMonth}
          maxMonth={vm.maxMonth}
          onSelect={vm.onPickMonth}
        />
      ) : (
        <>
          <Box
            style={styles.weekdays}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {vm.weekdays.map((weekday) => (
              <Box key={weekday.key} style={styles.weekday}>
                <Text variant="caption" color="textSecondary">
                  {weekday.label}
                </Text>
              </Box>
            ))}
          </Box>
          {vm.weeks.map((week) => (
            <Box key={week[0]?.iso} style={styles.week}>
              {week.map((cell) => (
                <DayCell
                  key={cell.iso}
                  label={cell.label}
                  accessibilityLabel={cell.accessibilityLabel}
                  isSelected={cell.isSelected}
                  isToday={cell.isToday}
                  isDisabled={cell.isDisabled}
                  isOutside={!cell.inMonth}
                  testID={suffix(`day.${cell.iso}`)}
                  onPress={() => {
                    vm.onSelect(cell.iso);
                  }}
                />
              ))}
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
