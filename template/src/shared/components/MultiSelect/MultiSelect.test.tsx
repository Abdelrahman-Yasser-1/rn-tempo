import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen, within } from '@testing-library/react-native';

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

  it('keeps the trigger a plain row item that nothing overlays (Android swallows taps otherwise)', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Tags' });
    expect(trigger).not.toHaveStyle({ position: 'absolute' });
    expect(within(trigger).getByText('Select options')).toBeOnTheScreen();
  });

  it('puts the chips beside the trigger, not inside it or over it', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['a']} onChange={jest.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Tags' });
    expect(trigger).not.toHaveStyle({ position: 'absolute' });
    expect(within(trigger).queryByText('Alpha')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeOnTheScreen();
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
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'first');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: 'Beta' })).not.toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('Search options'), 'zzz');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByText('No results')).toBeOnTheScreen();
    });

    it('waits for the debounce before filtering, and ignores case', async () => {
      await renderWithProviders(
        <MultiSelect label="Tags" searchable options={OPTIONS} value={[]} onChange={jest.fn()} />,
      );
      jest.useFakeTimers();
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'BETA');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeOnTheScreen();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(150);
      });
      expect(screen.queryByRole('checkbox', { name: 'Alpha' })).not.toBeOnTheScreen();
      expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeOnTheScreen();
    });

    it('selects only the filtered, enabled options with Select all', async () => {
      const onChange = jest.fn();
      await renderWithProviders(
        <MultiSelect label="Tags" searchable options={OPTIONS} value={[]} onChange={onChange} />,
      );
      jest.useFakeTimers();
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'a');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      // "a" matches Alpha, Beta, Gamma (disabled), Delta; Epsilon has no "a".
      await fireEvent.press(screen.getByRole('button', { name: 'Select all' }));
      expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'd']);
    });

    it('has no search field unless searchable', async () => {
      await renderWithProviders(
        <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
      );
      expect(screen.queryByLabelText('Search options')).not.toBeOnTheScreen();
    });
  });

  it('shows up to three selections as chips and four as a count', async () => {
    const { rerender } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['a', 'b', 'd']} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove Delta' })).toBeOnTheScreen();
    expect(screen.queryByText('3 selected')).not.toBeOnTheScreen();
    await rerender(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={['a', 'b', 'd', 'e']}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('4 selected')).toBeOnTheScreen();
  });

  it('keeps the other chips when one is removed', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={['a', 'b', 'd']} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Remove Beta' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'd']);
  });

  it('uses a custom placeholder when nothing is selected', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        placeholder="Pick tags"
        options={OPTIONS}
        value={[]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick tags')).toBeOnTheScreen();
  });

  it('does not select a disabled option', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={onChange} />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Gamma' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the option description under its label', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText('First letter')).toBeOnTheScreen();
  });

  it('blocks a further selection at the limit, but lets a selected option be unticked', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={['a', 'b']}
        maxSelected={2}
        onChange={onChange}
      />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Delta' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith(['a']);
    expect(screen.getByText('Choose up to 2')).toBeOnTheScreen();
  });

  it('enables the unselected options again below the limit', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        options={OPTIONS}
        value={['a']}
        maxSelected={2}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Delta' })).toBeEnabled();
  });

  it('disables Clear while nothing is selected', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('closes the sheet from its close button', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalled();
  });

  it('titles the sheet with the sheetTitle, or else the label', async () => {
    const { rerender } = await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Tags' })).toBeOnTheScreen();
    await rerender(
      <MultiSelect
        label="Tags"
        sheetTitle="Choose tags"
        options={OPTIONS}
        value={[]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Choose tags' })).toBeOnTheScreen();
  });

  it('shows no empty state while there are options', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.queryByText('No results')).not.toBeOnTheScreen();
  });

  it('shows the empty state when there are no options at all', async () => {
    await renderWithProviders(
      <MultiSelect label="Tags" options={[]} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText('No results')).toBeOnTheScreen();
  });

  it('is disabled, with disabled chips, when disabled', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <MultiSelect label="Tags" disabled options={OPTIONS} value={['a']} onChange={jest.fn()} />,
    );
    const field = screen.getByRole('combobox', { name: 'Tags' });
    expect(field).toBeDisabled();
    await user.press(field);
    expect(present).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remove Alpha' })).not.toBeOnTheScreen();
  });

  it('shows the helper text and the sub label', async () => {
    await renderWithProviders(
      <MultiSelect
        label="Tags"
        subLabel="(optional)"
        helperText="Pick some"
        options={OPTIONS}
        value={[]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick some')).toBeOnTheScreen();
    expect(screen.getByText('(optional)')).toBeOnTheScreen();
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

  it('does not make the sheet one accessible node, so screen readers reach its contents', async () => {
    const render = jest.spyOn(BottomSheetModal.prototype, 'render');
    await renderWithProviders(
      <MultiSelect label="Tags" options={OPTIONS} value={[]} onChange={jest.fn()} />,
    );
    const [sheet] = render.mock.contexts as { props: { accessible?: boolean } }[];
    expect(sheet?.props.accessible).toBe(false);
  });
});
