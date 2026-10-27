import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { SelectOption, SelectProps } from './types';

const SNAP_POINTS = ['50%'];

function renderBackdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />;
}

type SelectItemProps = Readonly<{
  option: SelectOption;
  isSelected: boolean;
  testID?: string;
  onSelect: (value: string) => void;
}>;

function SelectItem({ option, isSelected, testID, onSelect }: SelectItemProps) {
  const isDisabled = option.disabled ?? false;
  const state = { selected: isSelected, disabled: isDisabled };
  styles.useVariants({ selected: isSelected });

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      testID={testID}
      disabled={isDisabled}
      style={styles.option}
      onPress={() => {
        onSelect(option.value);
      }}
    >
      <Text color={isDisabled ? 'textDisabled' : 'textPrimary'}>{option.label}</Text>
      {isSelected && <Icon name="check" size={20} color="primary" />}
    </Pressable>
  );
}

/** Field-like trigger that opens a bottom sheet list of options. */
export function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  sheetTitle,
  helperText,
  errorText,
  disabled: isDisabled = false,
  testID,
}: SelectProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({ open: isOpen, invalid: isInvalid, disabled: isDisabled });

  const selected = options.find((option) => option.value === value);
  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const title = sheetTitle ?? label;
  const state = { expanded: isOpen, disabled: isDisabled };

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      sheetRef.current?.dismiss();
    },
    [onChange],
  );

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <Text testID={testID ? `${testID}.label` : undefined} variant="label" color="textSecondary">
          {label}
        </Text>
      )}
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        accessibilityState={state}
        hitSlop={HIT_SLOP}
        testID={testID}
        disabled={isDisabled}
        style={styles.trigger}
        onPress={() => {
          setIsOpen(true);
          sheetRef.current?.present();
        }}
      >
        <Text
          testID={testID ? `${testID}.value` : undefined}
          style={styles.triggerText}
          numberOfLines={1}
          color={selected ? 'textPrimary' : 'textSecondary'}
        >
          {selected?.label ?? placeholder ?? t('select.placeholder')}
        </Text>
        <Box style={styles.chevron}>
          <Icon name="chevron-right" size={20} color="textSecondary" />
        </Box>
      </Pressable>
      {message !== undefined && message !== '' && (
        <Text
          testID={testID ? `${testID}.${messageKind}` : undefined}
          variant="caption"
          color={isInvalid ? 'error' : 'textSecondary'}
          accessibilityLiveRegion={isInvalid ? 'polite' : undefined}
          accessibilityRole={isInvalid ? 'alert' : undefined}
        >
          {message}
        </Text>
      )}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => {
          setIsOpen(false);
        }}
      >
        <Box style={styles.sheetHeader}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <IconButton
            testID={testID ? `${testID}.close` : undefined}
            icon="close"
            size="sm"
            accessibilityLabel={t('select.close')}
            onPress={() => {
              sheetRef.current?.dismiss();
            }}
          />
        </Box>
        <BottomSheetFlatList
          data={options}
          keyExtractor={(option) => option.value}
          contentContainerStyle={styles.sheetContent}
          renderItem={({ item }) => (
            <SelectItem
              option={item}
              isSelected={item.value === value}
              testID={testID ? `${testID}.option.${item.value}` : undefined}
              onSelect={handleSelect}
            />
          )}
        />
      </BottomSheetModal>
    </Box>
  );
}
