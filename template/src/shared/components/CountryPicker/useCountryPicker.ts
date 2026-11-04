import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { COUNTRIES, DEFAULT_COUNTRY_ISO2 } from '@shared/constants/countries';
import type { Country } from '@shared/constants/countries';
import { useDebounce } from '@shared/hooks';
import { countryName, filterCountries, findCountry, sortCountries } from '@shared/utils/countries';

import type { CountryPickerProps } from './types';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Logic of the country picker: open state, the selected country (with the default as fallback),
 * the list sorted by localized name, the debounced search and the sheet's present/dismiss calls.
 */
export function useCountryPicker({
  value,
  defaultCountry = DEFAULT_COUNTRY_ISO2,
  onChange,
}: Pick<CountryPickerProps, 'value' | 'defaultCountry' | 'onChange'>) {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const sorted = useMemo(() => sortCountries(COUNTRIES, language), [language]);
  const visibleCountries = useMemo(() => filterCountries(sorted, query), [sorted, query]);
  const selected = findCountry(value) ?? findCountry(defaultCountry) ?? COUNTRIES[0];

  const getName = (country: Country) => countryName(country, language);

  const onOpen = () => {
    setIsOpen(true);
    sheetRef.current?.present();
  };

  const onClose = () => {
    sheetRef.current?.dismiss();
  };

  const onDismiss = () => {
    setIsOpen(false);
    setSearch('');
  };

  const onSelect = (country: Country) => {
    onChange(country);
    sheetRef.current?.dismiss();
  };

  return {
    sheetRef,
    isOpen,
    selected,
    search,
    visibleCountries,
    getName,
    onSearchChange: setSearch,
    onOpen,
    onClose,
    onDismiss,
    onSelect,
  };
}
