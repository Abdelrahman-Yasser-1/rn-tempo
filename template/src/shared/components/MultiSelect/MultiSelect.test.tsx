import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MultiSelect } from './MultiSelect';

const OPTIONS = [
  { value: 'a', label: 'Alpha', description: 'First letter' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
  { value: 'd', label: 'Delta' },
  { value: 'e', label: 'Epsilon' },
];

describe('MultiSelect', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('is a combobox listing the selected labels, with removable chips', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['a', 'b']} onChange={onChange} />,
    );
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveAccessibilityValue({
      text: 'Alpha, Beta',
    });
    await user.press(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('collapses to a count when the chips would overflow', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={['a', 'b', 'd', 'e']}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('4 selected')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove Alpha' })).not.toBeOnTheScreen();
  });

  it('shows the placeholder when nothing is selected', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select options')).toBeOnTheScreen();
  });

  it('opens the sheet when the field is pressed', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Tags' }));
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeExpanded();
  });

  it('toggles options without closing the sheet', async () => {
    const onChange = jest.fn();
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['a']} onChange={onChange} />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
    await user.press(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('disables disabled options and, at the limit, the unselected ones', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={['a']}
        maxSelected={1}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Gamma' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeOnTheScreen();
    expect(screen.getByText('Choose up to 1')).toBeOnTheScreen();
  });

  it('selects every enabled option with Select all and clears with Clear', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['b']} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a', 'd', 'e']);
    await user.press(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('closes the sheet from the Done footer', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(dismiss).toHaveBeenCalled();
  });

  describe('searchable', () => {
    it('filters by label or description after the debounce, with an empty state', async () => {
      await renderWithProviders(
        <MultiSelect label="Tags" searchable options={OPTIONS} value={[]} onChange={jest.fn()} />,
      );
      jest.useFakeTimers();
      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'first');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: 'Beta' })).not.toBeOnTheScreen();

      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'zzz');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByText('No results')).toBeOnTheScreen();
    });
  });

  it('does not open or offer chip removal when read only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" readOnly options={OPTIONS} value={['a']} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Tags' }));
    expect(present).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveAccessibilityValue({
      text: 'Alpha',
    });
    expect(screen.queryByRole('button', { name: 'Remove Alpha' })).not.toBeOnTheScreen();
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={[]}
        helperText="Pick some"
        errorText="Tags are required"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Pick some')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Tags are required' })).toBeOnTheScreen();
  });
});
