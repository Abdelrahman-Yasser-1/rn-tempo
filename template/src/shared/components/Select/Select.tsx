import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { EmptyState } from '../EmptyState';
import { FieldLabel } from '../FieldLabel';
import { FieldMessage } from '../FieldMessage';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { SelectOption, SelectProps } from './types';
import { useSelect } from './useSelect';

const SNAP_POINTS = ['50%'];
const SEARCHABLE_SNAP_POINTS = ['70%'];

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

type SelectSearchProps = Readonly<{
  value: string;
  onChangeText: (text: string) => void;
  testID?: string;
}>;

function SelectSearch({ value, onChangeText, testID }: SelectSearchProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();

  return (
    <Box style={styles.search}>
      <Icon name="search" size="md" color="textSecondary" />
      <BottomSheetTextInput
        testID={testID}
        accessibilityLabel={t('select.searchLabel')}
        placeholder={t('select.searchPlaceholder')}
        placeholderTextColor={theme.colors.textSecondary}
        selectionColor={theme.colors.primary}
        maxFontSizeMultiplier={1.5}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        value={value}
        style={styles.searchInput}
        onChangeText={onChangeText}
      />
    </Box>
  );
}

/**
 * Field-like trigger that opens a bottom sheet list of options, optionally with a search field,
 * an empty state when nothing matches, and a read-only mode that never opens.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  placeholder,
  sheetTitle,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  searchable: isSearchable = false,
  testID,
}: SelectProps) {
  const { t } = useTranslation();
  const { sheetRef, ...vm } = useSelect({ options, value, onChange });
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({
    open: vm.isOpen,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const selected = vm.selected;
  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const title = sheetTitle ?? label;
  const state = { expanded: vm.isOpen, disabled: isDisabled };

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <FieldLabel
          testID={testID ? `${testID}.label` : undefined}
          label={label}
          required={isRequired}
          subLabel={subLabel}
          tooltip={tooltip}
        />
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
        onPress={isReadOnly ? undefined : vm.onOpen}
      >
        <Text
          testID={testID ? `${testID}.value` : undefined}
          style={styles.triggerText}
          numberOfLines={1}
          color={selected ? 'textPrimary' : 'textSecondary'}
        >
          {selected?.label ?? placeholder ?? t('select.placeholder')}
        </Text>
        {!isReadOnly && <Icon name="chevron-down" size="md" color="textSecondary" />}
      </Pressable>
      {message !== undefined && message !== '' && (
        <FieldMessage
          testID={testID ? `${testID}.${messageKind}` : undefined}
          variant={messageKind}
          message={message}
        />
      )}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={isSearchable ? SEARCHABLE_SNAP_POINTS : SNAP_POINTS}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={vm.onDismiss}
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
            onPress={vm.onClose}
          />
        </Box>
        {isSearchable && (
          <SelectSearch
            testID={testID ? `${testID}.search` : undefined}
            value={vm.search}
            onChangeText={vm.onSearchChange}
          />
        )}
        <BottomSheetFlatList
          data={vm.visibleOptions}
          keyExtractor={(option) => option.value}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              testID={testID ? `${testID}.empty` : undefined}
              title={t('select.empty.title')}
              message={t('select.empty.message')}
            />
          }
          renderItem={({ item }) => (
            <SelectItem
              option={item}
              isSelected={item.value === value}
              testID={testID ? `${testID}.option.${item.value}` : undefined}
              onSelect={vm.onSelect}
            />
          )}
        />
      </BottomSheetModal>
    </Box>
  );
}
