import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { FieldLabel } from '../FieldLabel';
import { FieldMessage } from '../FieldMessage';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { styles as selectStyles } from '../Select/styles';
import { Text } from '../Text';
// The sheet header, handle and search field look exactly like the Select sheet.

import { styles } from './styles';
import type { MultiSelectOption, MultiSelectProps } from './types';
import { useMultiSelect } from './useMultiSelect';

const SNAP_POINTS = ['60%'];
const SEARCHABLE_SNAP_POINTS = ['80%'];

function renderBackdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />;
}

type OptionRowProps = Readonly<{
  option: MultiSelectOption;
  isChecked: boolean;
  isDisabled: boolean;
  testID?: string;
  onToggle: (value: string) => void;
}>;

function OptionRow({ option, isChecked, isDisabled, testID, onToggle }: OptionRowProps) {
  return (
    <Box style={styles.option}>
      <Checkbox
        testID={testID}
        label={option.label}
        checked={isChecked}
        disabled={isDisabled}
        onChange={() => {
          onToggle(option.value);
        }}
      />
      {option.description !== undefined && option.description !== '' && (
        <Text
          testID={testID ? `${testID}.description` : undefined}
          variant="caption"
          color="textSecondary"
          style={styles.description}
        >
          {option.description}
        </Text>
      )}
    </Box>
  );
}

/**
 * Field that shows the selected options as removable chips (or "n selected" when there are many)
 * and opens a bottom sheet of checkbox rows with optional search, select all / clear and a Done
 * footer. Changes apply immediately; Done only closes the sheet.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  maxSelected,
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
}: MultiSelectProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { sheetRef, ...vm } = useMultiSelect({ options, value, onChange, maxSelected });
  const isInvalid = errorText !== undefined && errorText !== '';
  const isInert = isDisabled || isReadOnly;
  styles.useVariants({
    open: vm.isOpen,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const title = sheetTitle ?? label;
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const summary =
    vm.selectedOptions.length === 0
      ? undefined
      : vm.selectedOptions.map((option) => option.label).join(', ');

  const renderFooter = (props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props}>
      <Box style={styles.footer}>
        <Button
          testID={suffix('done')}
          title={t('multiSelect.done')}
          fullWidth
          onPress={vm.onClose}
        />
      </Box>
    </BottomSheetFooter>
  );

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <FieldLabel
          testID={suffix('label')}
          label={label}
          required={isRequired}
          subLabel={subLabel}
          tooltip={tooltip}
        />
      )}
      <Box style={styles.field}>
        <Pressable
          accessibilityRole="combobox"
          accessibilityLabel={label}
          accessibilityValue={{ text: summary }}
          accessibilityState={{ expanded: vm.isOpen, disabled: isDisabled }}
          hitSlop={HIT_SLOP}
          testID={testID}
          disabled={isDisabled}
          style={styles.trigger}
          onPress={isReadOnly ? undefined : vm.onOpen}
        />
        <Box style={styles.content} pointerEvents="box-none">
          {vm.hasSelection && vm.hasInlineChips ? (
            <Box style={styles.chips} pointerEvents="box-none">
              {vm.selectedOptions.map((option) => (
                <Chip
                  key={option.value}
                  testID={suffix(`chip.${option.value}`)}
                  label={option.label}
                  leftIcon={isInert ? undefined : 'close'}
                  disabled={isDisabled}
                  accessibilityLabel={
                    isInert ? option.label : t('multiSelect.remove', { label: option.label })
                  }
                  onPress={
                    isInert
                      ? undefined
                      : () => {
                          vm.onRemove(option.value);
                        }
                  }
                />
              ))}
            </Box>
          ) : (
            <Text
              testID={suffix('value')}
              style={styles.summary}
              numberOfLines={1}
              color={vm.hasSelection ? 'textPrimary' : 'textSecondary'}
              pointerEvents="none"
            >
              {vm.hasSelection
                ? t('multiSelect.selected', { selected: vm.selectedOptions.length })
                : (placeholder ?? t('multiSelect.placeholder'))}
            </Text>
          )}
          {!isReadOnly && <Icon name="chevron-down" size="md" color="textSecondary" />}
        </Box>
      </Box>
      {message !== undefined && message !== '' && (
        <FieldMessage testID={suffix(messageKind)} variant={messageKind} message={message} />
      )}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={isSearchable ? SEARCHABLE_SNAP_POINTS : SNAP_POINTS}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={selectStyles.sheetBackground}
        handleIndicatorStyle={selectStyles.sheetHandle}
        footerComponent={renderFooter}
        onDismiss={vm.onDismiss}
      >
        <Box style={selectStyles.sheetHeader}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <IconButton
            testID={suffix('close')}
            icon="close"
            size="sm"
            accessibilityLabel={t('select.close')}
            onPress={vm.onClose}
          />
        </Box>
        {isSearchable && (
          <Box style={selectStyles.search}>
            <Icon name="search" size="md" color="textSecondary" />
            <BottomSheetTextInput
              testID={suffix('search')}
              accessibilityLabel={t('select.searchLabel')}
              placeholder={t('select.searchPlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              selectionColor={theme.colors.primary}
              maxFontSizeMultiplier={1.5}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              value={vm.search}
              style={selectStyles.searchInput}
              onChangeText={vm.onSearchChange}
            />
          </Box>
        )}
        <Box style={styles.toolbar}>
          {maxSelected === undefined ? (
            <Button
              testID={suffix('selectAll')}
              title={t('multiSelect.selectAll')}
              variant="ghost"
              size="sm"
              disabled={!vm.canSelectAll}
              onPress={vm.onSelectAll}
            />
          ) : (
            <Text variant="caption" color="textSecondary">
              {t('multiSelect.limit', { max: maxSelected })}
            </Text>
          )}
          <Button
            testID={suffix('clear')}
            title={t('multiSelect.clear')}
            variant="ghost"
            size="sm"
            disabled={!vm.hasSelection}
            onPress={vm.onClear}
          />
        </Box>
        <BottomSheetFlatList
          data={vm.visibleOptions}
          keyExtractor={(option) => option.value}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              testID={suffix('empty')}
              title={t('select.empty.title')}
              message={t('select.empty.message')}
            />
          }
          ListFooterComponent={<Box style={styles.footerSpace} />}
          renderItem={({ item }) => {
            const isChecked = value.includes(item.value);
            return (
              <OptionRow
                option={item}
                isChecked={isChecked}
                isDisabled={(item.disabled ?? false) || (vm.isMaxReached && !isChecked)}
                testID={suffix(`option.${item.value}`)}
                onToggle={vm.onToggle}
              />
            );
          }}
        />
      </BottomSheetModal>
    </Box>
  );
}
