import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { BottomSheet } from './BottomSheet';

// The gorhom mock renders content unconditionally, so visibility is checked through the ref calls.
describe('BottomSheet', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('presents the sheet when visible', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    await renderWithProviders(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    expect(present).toHaveBeenCalled();
  });

  it('dismisses the sheet when hidden', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    await renderWithProviders(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    expect(dismiss).toHaveBeenCalled();
  });

  it('renders a header title and the children', async () => {
    await renderWithProviders(
      <BottomSheet visible title="Filters" onClose={jest.fn()}>
        <Text>Price range</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('header', { name: 'Filters' })).toBeOnTheScreen();
    expect(screen.getByText('Price range')).toBeOnTheScreen();
  });

  it('dismisses from its close button', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <BottomSheet visible title="Filters" onClose={jest.fn()}>
        <Text>Body</Text>
      </BottomSheet>,
    );
    dismiss.mockClear();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalled();
  });
});
