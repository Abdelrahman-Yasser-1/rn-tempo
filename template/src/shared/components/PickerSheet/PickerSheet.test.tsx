import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PickerSheet } from './PickerSheet';

describe('PickerSheet', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('presents when visible and renders the title and children', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    await renderWithProviders(
      <PickerSheet visible title="Pick" onClose={jest.fn()}>
        <Text>Body</Text>
      </PickerSheet>,
    );
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Pick' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('has no footer without onConfirm', async () => {
    await renderWithProviders(<PickerSheet visible title="Pick" onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeOnTheScreen();
  });

  it('confirms and dismisses from the footer', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <PickerSheet visible title="Pick" onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    dismiss.mockClear();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalled();
  });

  it('cancels without confirming', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <PickerSheet visible title="Pick" onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    dismiss.mockClear();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });
});
