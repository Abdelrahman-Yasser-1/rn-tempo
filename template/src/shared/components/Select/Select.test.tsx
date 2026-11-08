import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('Select', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is a combobox named by its label, exposing the selected option', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="b" onChange={jest.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Plan' });
    expect(trigger).toHaveAccessibilityValue({ text: 'Beta' });
    // The option list is also rendered (the sheet mock is always mounted), so scope to the trigger.
    expect(within(trigger).getByText('Beta')).toBeOnTheScreen();
  });

  it('shows the placeholder when nothing is selected', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
  });

  it('uses a custom placeholder when given', async () => {
    await renderWithProviders(
      <Select
        label="Plan"
        placeholder="Pick a plan"
        options={OPTIONS}
        value={undefined}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick a plan')).toBeOnTheScreen();
  });

  it('opens the option sheet when the trigger is pressed', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Plan' }));
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeExpanded();
  });

  it('reports the chosen option and dismisses the sheet', async () => {
    const onChange = jest.fn();
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="a" onChange={onChange} />,
    );
    await user.press(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(dismiss).toHaveBeenCalled();
  });

  it('does not select disabled options', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="a" onChange={onChange} />,
    );
    const gamma = screen.getByRole('radio', { name: 'Gamma' });
    expect(gamma).toBeDisabled();
    await user.press(gamma);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <Select
        label="Plan"
        options={OPTIONS}
        value={undefined}
        helperText="Choose one"
        errorText="Plan is required"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Choose one')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Plan is required' })).toBeOnTheScreen();
  });

  it('is disabled when disabled', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} disabled onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeDisabled();
  });

  describe('searchable', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('has no search field unless searchable', async () => {
      await renderWithProviders(
        <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />,
      );
      expect(screen.queryByLabelText('Search options')).not.toBeOnTheScreen();
    });

    it('filters the options after the debounce', async () => {
      await renderWithProviders(
        <Select label="Plan" searchable options={OPTIONS} value={undefined} onChange={jest.fn()} />,
      );
      jest.useFakeTimers();
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'bet');
      // The query is debounced, so every option is still listed.
      expect(screen.getByRole('radio', { name: 'Alpha' })).toBeOnTheScreen();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByRole('radio', { name: 'Beta' })).toBeOnTheScreen();
      expect(screen.queryByRole('radio', { name: 'Alpha' })).not.toBeOnTheScreen();
    });

    it('matches case-insensitively', async () => {
      await renderWithProviders(
        <Select label="Plan" searchable options={OPTIONS} value={undefined} onChange={jest.fn()} />,
      );
      jest.useFakeTimers();
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'ALP');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByRole('radio', { name: 'Alpha' })).toBeOnTheScreen();
      expect(screen.queryByRole('radio', { name: 'Beta' })).not.toBeOnTheScreen();
    });

    it('shows the empty state when nothing matches', async () => {
      await renderWithProviders(
        <Select label="Plan" searchable options={OPTIONS} value={undefined} onChange={jest.fn()} />,
      );
      expect(screen.queryByText('No results')).not.toBeOnTheScreen();
      jest.useFakeTimers();
      await fireEvent.changeText(screen.getByLabelText('Search options'), 'zzz');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      expect(screen.getByText('No results')).toBeOnTheScreen();
      expect(screen.getByText('Try a different search term.')).toBeOnTheScreen();
    });
  });

  it('does not open when read only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <Select label="Plan" readOnly options={OPTIONS} value="a" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Plan' }));
    expect(present).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Plan' })).not.toBeExpanded();
    expect(
      within(screen.getByRole('combobox', { name: 'Plan' })).getByText('Alpha'),
    ).toBeOnTheScreen();
  });

  it('marks the label as required', async () => {
    await renderWithProviders(
      <Select label="Plan" required options={OPTIONS} value={undefined} onChange={jest.fn()} />,
    );
    expect(screen.getByLabelText('required')).toBeOnTheScreen();
  });

  it('shows the sheet title from sheetTitle, falling back to the label', async () => {
    await renderWithProviders(
      <>
        <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />
        <Select
          label="Tier"
          sheetTitle="Choose a tier"
          options={OPTIONS}
          value={undefined}
          onChange={jest.fn()}
        />
      </>,
    );
    expect(screen.getByRole('header', { name: 'Plan' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Choose a tier' })).toBeOnTheScreen();
  });

  it('does not make the sheet one accessible node, so screen readers reach its contents', async () => {
    const render = jest.spyOn(BottomSheetModal.prototype, 'render');
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="b" onChange={jest.fn()} />,
    );
    const [sheet] = render.mock.contexts as { props: { accessible?: boolean } }[];
    expect(sheet?.props.accessible).toBe(false);
  });
});
