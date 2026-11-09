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

import { Box } from '@shared/components/Box';
import { EmptyState } from '@shared/components/EmptyState';
import { FieldLabel } from '@shared/components/FieldLabel';
import { FieldMessage } from '@shared/components/FieldMessage';
import { Icon } from '@shared/components/Icon';
import { IconButton } from '@shared/components/IconButton';
import { styles as selectStyles } from '@shared/components/Select/styles';
import { Text } from '@shared/components/Text';
import type { Country } from '@shared/constants/countries';
import { HIT_SLOP } from '@shared/constants/touch';

import { styles } from './styles';
import type { CountryPickerProps } from './types';
import { useCountryPicker } from './useCountryPicker';

const SNAP_POINTS = ['80%'];
// U+200E (left-to-right mark) keeps "+966" from rendering as "966+" in a right-to-left paragraph.
const LRM = '‎';

function renderBackdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />;
}

type CountryRowProps = Readonly<{
  country: Country;
  name: string;
  isSelected: boolean;
  testID?: string;
  onSelect: (country: Country) => void;
}>;

function CountryRow({ country, name, isSelected, testID, onSelect }: CountryRowProps) {
  styles.useVariants({ selected: isSelected });

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${name}, ${country.dialCode}`}
      accessibilityState={{ selected: isSelected }}
      hitSlop={HIT_SLOP}
      testID={testID}
      style={styles.option}
      onPress={() => {
        onSelect(country);
      }}
    >
      <Text style={styles.flag}>{country.flag}</Text>
      <Text style={styles.name}>{name}</Text>
      <Text color="textSecondary" style={styles.dial}>{`${LRM}${country.dialCode}`}</Text>
      {isSelected && <Icon name="check" size={20} color="primary" />}
    </Pressable>
  );
}

/**
 * Country field: a trigger showing the flag and dial code (and the name unless `compact`) that
 * opens a searchable bottom sheet of every country. Search matches the name in English and
 * Arabic, the ISO code and the dial code.
 */
export function CountryPicker({
  value,
  onChange,
  defaultCountry,
  compact: isCompact = false,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  testID,
}: CountryPickerProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { sheetRef, ...vm } = useCountryPicker({ value, defaultCountry, onChange });
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({
    compact: isCompact,
    open: vm.isOpen,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const selectedName = vm.selected ? vm.getName(vm.selected) : '';
  const selectedDial = vm.selected?.dialCode ?? '';

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
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label ?? t(($) => $.countryPicker.label)}
        accessibilityValue={{ text: `${selectedName}, ${selectedDial}` }}
        accessibilityState={{ expanded: vm.isOpen, disabled: isDisabled }}
        hitSlop={HIT_SLOP}
        testID={testID}
        disabled={isDisabled}
        style={styles.trigger}
        onPress={isReadOnly ? undefined : vm.onOpen}
      >
        <Text testID={suffix('flag')} style={styles.flag}>
          {vm.selected?.flag}
        </Text>
        {!isCompact && (
          <Text style={styles.name} numberOfLines={1}>
            {selectedName}
          </Text>
        )}
        <Text testID={suffix('dial')} color="textSecondary" style={styles.dial}>
          {`${LRM}${selectedDial}`}
        </Text>
        {!isReadOnly && <Icon name="chevron-down" size="md" color="textSecondary" />}
      </Pressable>
      {message !== undefined && message !== '' && (
        <FieldMessage testID={suffix(messageKind)} variant={messageKind} message={message} />
      )}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        enableDynamicSizing={false}
        accessible={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={selectStyles.sheetBackground}
        handleIndicatorStyle={selectStyles.sheetHandle}
        onDismiss={vm.onDismiss}
      >
        <Box style={selectStyles.sheetHeader}>
          <Text variant="title" accessibilityRole="header">
            {label ?? t(($) => $.countryPicker.title)}
          </Text>
          <IconButton
            testID={suffix('close')}
            icon="close"
            size="sm"
            accessibilityLabel={t(($) => $.countryPicker.close)}
            onPress={vm.onClose}
          />
        </Box>
        <Box style={selectStyles.search}>
          <Icon name="search" size="md" color="textSecondary" />
          <BottomSheetTextInput
            testID={suffix('search')}
            accessibilityLabel={t(($) => $.countryPicker.searchLabel)}
            placeholder={t(($) => $.countryPicker.searchPlaceholder)}
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
        <BottomSheetFlatList
          data={vm.visibleCountries}
          keyExtractor={(country) => country.iso2}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={
            <EmptyState
              testID={suffix('empty')}
              title={t(($) => $.select.empty.title)}
              message={t(($) => $.select.empty.message)}
            />
          }
          renderItem={({ item }) => (
            <CountryRow
              country={item}
              name={vm.getName(item)}
              isSelected={item.iso2 === vm.selected?.iso2}
              testID={suffix(`option.${item.iso2}`)}
              onSelect={vm.onSelect}
            />
          )}
        />
      </BottomSheetModal>
    </Box>
  );
}
