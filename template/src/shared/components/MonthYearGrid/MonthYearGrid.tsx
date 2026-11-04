import { FlatList, Pressable } from 'react-native';

import { Box } from '../Box';
import { Text } from '../Text';

import { styles } from './styles';
import type { MonthYearGridProps } from './types';
import { useMonthYearGrid, YEAR_ROW_HEIGHT } from './useMonthYearGrid';

type CellProps = Readonly<{
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  isCurrent?: boolean;
  isDisabled: boolean;
  testID?: string;
  onPress: () => void;
}>;

function Cell({
  label,
  accessibilityLabel,
  isSelected,
  isCurrent = false,
  isDisabled,
  testID,
  onPress,
}: CellProps) {
  styles.useVariants({ selected: isSelected, current: isCurrent, disabled: isDisabled });
  const textColor = isSelected ? 'onPrimary' : 'textPrimary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected || isCurrent, disabled: isDisabled }}
      testID={testID}
      disabled={isDisabled}
      style={styles.cell}
      onPress={onPress}
    >
      <Text variant="bodySmall" numberOfLines={1} color={textColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const getYearLayout = (_data: ArrayLike<number> | null | undefined, index: number) => ({
  length: YEAR_ROW_HEIGHT,
  offset: YEAR_ROW_HEIGHT * index,
  index,
});

/**
 * Twelve month buttons (3 columns by 4 rows) next to a scrollable list of years. Tapping a year
 * changes the year being browsed; tapping a month reports it with that year. The grid reads in the
 * layout direction, so Arabic runs right to left without reversing anything.
 */
export function MonthYearGrid({
  year,
  month,
  onSelect,
  minMonth,
  maxMonth,
  testID,
}: MonthYearGridProps) {
  const vm = useMonthYearGrid({ year, month, onSelect, minMonth, maxMonth });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <Box testID={testID} style={styles.root}>
      <Box style={styles.months}>
        {vm.names.map((name, index) => (
          <Box key={name} style={styles.monthSlot}>
            <Cell
              label={name}
              accessibilityLabel={vm.monthLabel(index)}
              isSelected={vm.isMonthSelected(index)}
              isDisabled={vm.isMonthDisabled(index)}
              testID={suffix(`month.${String(index)}`)}
              onPress={() => {
                vm.onMonthPress(index);
              }}
            />
          </Box>
        ))}
      </Box>
      <FlatList
        testID={suffix('years')}
        style={styles.years}
        data={vm.years}
        extraData={vm.browsedYear}
        keyExtractor={String}
        getItemLayout={getYearLayout}
        initialScrollIndex={vm.initialYearIndex}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Box style={styles.yearRow}>
            <Cell
              label={String(item)}
              accessibilityLabel={String(item)}
              isSelected={false}
              isCurrent={item === vm.browsedYear}
              isDisabled={vm.isYearDisabled(item)}
              testID={suffix(`year.${String(item)}`)}
              onPress={() => {
                vm.onYearPress(item);
              }}
            />
          </Box>
        )}
      />
    </Box>
  );
}
