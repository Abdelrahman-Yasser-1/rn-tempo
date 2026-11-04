import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { CountryPicker } from './CountryPicker';

/** Types into the sheet's search field and lets the debounce pass (switches to fake timers). */
async function searchFor(label: string, text: string) {
  jest.useFakeTimers();
  // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
  await fireEvent.changeText(screen.getByLabelText(label), text);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(250);
  });
}

describe('CountryPicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('shows the default country, Saudi Arabia, when no value is given', async () => {
    await renderWithProviders(<CountryPicker label="Country" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Saudi Arabia, +966',
    });
  });

  it('shows the country of the value', async () => {
    await renderWithProviders(<CountryPicker label="Country" value="EG" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Egypt, +20',
    });
  });

  it('opens the sheet when the trigger is pressed', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <CountryPicker label="Country" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Country' }));
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeExpanded();
  });

  it('reports the chosen country and dismisses the sheet', async () => {
    const onChange = jest.fn();
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <CountryPicker label="Country" onChange={onChange} />,
    );
    await user.press(screen.getByRole('radio', { name: 'Afghanistan, +93' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iso2: 'AF', dialCode: '+93' }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('searches by name, Arabic name, ISO code and dial code after the debounce', async () => {
    await renderWithProviders(<CountryPicker label="Country" onChange={jest.fn()} />);
    jest.useFakeTimers();
    const search = async (text: string) => {
      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
      await fireEvent.changeText(screen.getByLabelText('Search countries'), text);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
    };

    await search('egy');
    expect(screen.getByRole('radio', { name: 'Egypt, +20' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Saudi Arabia, +966' })).not.toBeOnTheScreen();

    await search('السعودية');
    expect(screen.getByRole('radio', { name: 'Saudi Arabia, +966' })).toBeOnTheScreen();

    await search('ae');
    expect(screen.getByRole('radio', { name: 'United Arab Emirates, +971' })).toBeOnTheScreen();

    await search('+974');
    expect(screen.getByRole('radio', { name: 'Qatar, +974' })).toBeOnTheScreen();

    await search('zzzz');
    expect(screen.getByText('No results')).toBeOnTheScreen();
  });

  it('does not open when read only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <CountryPicker label="Country" readOnly onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Country' }));
    expect(present).not.toHaveBeenCalled();
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <CountryPicker
        label="Country"
        helperText="Where you live"
        errorText="Pick a country"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Where you live')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Pick a country' })).toBeOnTheScreen();
  });

  describe('search', () => {
    const search = (text: string) => searchFor('Search countries', text);

    const renderPicker = () =>
      renderWithProviders(<CountryPicker label="Country" onChange={jest.fn()} />);

    it('waits for the debounce before filtering', async () => {
      await renderPicker();
      jest.useFakeTimers();
      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
      await fireEvent.changeText(screen.getByLabelText('Search countries'), 'egy');
      expect(screen.getByRole('radio', { name: 'Afghanistan, +93' })).toBeOnTheScreen();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.queryByRole('radio', { name: 'Afghanistan, +93' })).not.toBeOnTheScreen();
    });

    it('matches the English name in any case', async () => {
      await renderPicker();
      await search('UNITED ARAB');
      expect(screen.getByRole('radio', { name: 'United Arab Emirates, +971' })).toBeOnTheScreen();
    });

    it('matches the ISO code, in any case', async () => {
      await renderPicker();
      await search('Eg');
      expect(screen.getByRole('radio', { name: 'Egypt, +20' })).toBeOnTheScreen();
    });

    it('matches the dial code with the plus', async () => {
      await renderPicker();
      await search('+20');
      expect(screen.getByRole('radio', { name: 'Egypt, +20' })).toBeOnTheScreen();
      expect(screen.queryByRole('radio', { name: 'Saudi Arabia, +966' })).not.toBeOnTheScreen();
    });

    it('matches the dial code without the plus', async () => {
      await renderPicker();
      await search('966');
      expect(screen.getByRole('radio', { name: 'Saudi Arabia, +966' })).toBeOnTheScreen();
      expect(screen.queryByRole('radio', { name: 'Egypt, +20' })).not.toBeOnTheScreen();
    });

    it('lists the countries again when the search is cleared', async () => {
      await renderPicker();
      await search('egy');
      await search('');
      expect(screen.getByRole('radio', { name: 'Afghanistan, +93' })).toBeOnTheScreen();
    });
  });

  it('marks the current country as selected in the list', async () => {
    await renderWithProviders(<CountryPicker label="Country" value="AF" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Afghanistan, +93' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Albania, +355' })).not.toBeSelected();
  });

  it('accepts the ISO code in lower case', async () => {
    await renderWithProviders(<CountryPicker label="Country" value="eg" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Egypt, +20',
    });
  });

  it('falls back to the given default country for an unknown value', async () => {
    await renderWithProviders(
      <CountryPicker label="Country" value="ZZ" defaultCountry="AE" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'United Arab Emirates, +971',
    });
  });

  it('shows the flag and the dial code on the trigger', async () => {
    await renderWithProviders(
      <CountryPicker label="Country" value="EG" onChange={jest.fn()} testID="country" />,
    );
    expect(screen.getByText('🇪🇬', { exact: false })).toBeOnTheScreen();
    expect(screen.getAllByText('‎+20').length).toBeGreaterThan(0);
  });

  it('shows the country name on the trigger, but not in compact mode', async () => {
    const { rerender } = await renderWithProviders(
      <CountryPicker label="Country" value="AF" onChange={jest.fn()} />,
    );
    // One in the trigger, one in the list.
    expect(screen.getAllByText('Afghanistan')).toHaveLength(2);
    await rerender(<CountryPicker compact label="Country" value="AF" onChange={jest.fn()} />);
    expect(screen.getAllByText('Afghanistan')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Afghanistan, +93',
    });
  });

  it('still opens and picks a country in compact mode', async () => {
    const onChange = jest.fn();
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(<CountryPicker compact onChange={onChange} />);
    await user.press(screen.getByRole('combobox', { name: 'Country' }));
    expect(present).toHaveBeenCalled();
    await user.press(screen.getByRole('radio', { name: 'Albania, +355' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iso2: 'AL' }));
  });

  it('closes the sheet from its close button', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <CountryPicker label="Country" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('is disabled when disabled', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <CountryPicker label="Country" disabled onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Country' }));
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeDisabled();
    expect(present).not.toHaveBeenCalled();
  });

  it('shows the helper text', async () => {
    await renderWithProviders(
      <CountryPicker label="Country" helperText="Where you live" onChange={jest.fn()} />,
    );
    expect(screen.getByText('Where you live')).toBeOnTheScreen();
  });

  describe('in Arabic', () => {
    it('names the countries in Arabic', async () => {
      await renderWithProviders(<CountryPicker label="الدولة" value="EG" onChange={jest.fn()} />, {
        language: 'ar',
      });
      expect(screen.getByRole('combobox', { name: 'الدولة' })).toHaveAccessibilityValue({
        text: 'مصر, +20',
      });
    });

    it('picks a country by its Arabic name', async () => {
      const onChange = jest.fn();
      const { user } = await renderWithProviders(
        <CountryPicker label="الدولة" onChange={onChange} />,
        { language: 'ar' },
      );
      await searchFor('البحث في الدول', 'مصر');
      await user.press(screen.getByRole('radio', { name: 'مصر, +20' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iso2: 'EG' }));
    });

    it('searches by the Arabic name, and still by the English one', async () => {
      await renderWithProviders(<CountryPicker label="الدولة" onChange={jest.fn()} />, {
        language: 'ar',
      });
      await searchFor('البحث في الدول', 'مصر');
      expect(screen.getByRole('radio', { name: 'مصر, +20' })).toBeOnTheScreen();
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      await searchFor('البحث في الدول', 'egypt');
      expect(screen.getByRole('radio', { name: 'مصر, +20' })).toBeOnTheScreen();
    });
  });

  it('does not make the sheet one accessible node, so screen readers reach its contents', async () => {
    const render = jest.spyOn(BottomSheetModal.prototype, 'render');
    await renderWithProviders(<CountryPicker label="Country" value="US" onChange={jest.fn()} />);
    const [sheet] = render.mock.contexts as { props: { accessible?: boolean } }[];
    expect(sheet?.props.accessible).toBe(false);
  });
});
