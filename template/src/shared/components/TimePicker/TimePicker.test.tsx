import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the placeholder, then the formatted time', async () => {
    const { rerender } = await renderWithProviders(
      <TimePicker label="Time" onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select a time')).toBeOnTheScreen();
    await rerender(<TimePicker label="Time" value="14:30" onChange={jest.fn()} />);
    expect(screen.getByText(/^2:30\sPM$/)).toBeOnTheScreen();
  });

  it('opens the sheet on iOS and reports the confirmed time', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimePicker label="Time" value="14:30" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Time' }));
    expect(present).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('14:30');
  });
});
