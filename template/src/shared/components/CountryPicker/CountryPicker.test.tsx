import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { CountryPicker } from './CountryPicker';

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
});
