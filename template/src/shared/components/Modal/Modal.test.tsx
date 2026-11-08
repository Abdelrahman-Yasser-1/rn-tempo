import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Modal } from './Modal';

describe('Modal', () => {
  it('shows its title as a header and renders its children while visible', async () => {
    await renderWithProviders(
      <Modal visible title="Delete item" onClose={jest.fn()}>
        <Text>Are you sure?</Text>
      </Modal>,
    );
    expect(screen.getByRole('header', { name: 'Delete item' })).toBeOnTheScreen();
    expect(screen.getByText('Are you sure?')).toBeOnTheScreen();
  });

  it('renders nothing while hidden', async () => {
    await renderWithProviders(
      <Modal visible={false} title="Hidden" onClose={jest.fn()}>
        <Text>Secret</Text>
      </Modal>,
    );
    expect(screen.queryByText('Secret')).not.toBeOnTheScreen();
  });

  it('closes when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    const { user } = await renderWithProviders(
      <Modal visible onClose={onClose} testID="modal">
        <Text>Body</Text>
      </Modal>,
    );
    // The panel is an accessibilityViewIsModal, so the backdrop is trapped out of role queries.
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- backdrop is hidden from the a11y tree
    await user.press(screen.getByTestId('modal.backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cannot be dismissed when dismissable is false', async () => {
    const onClose = jest.fn();
    const { user } = await renderWithProviders(
      <Modal visible dismissable={false} onClose={onClose} testID="modal">
        <Text>Body</Text>
      </Modal>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- backdrop is hidden from the a11y tree
    const backdrop = screen.getByTestId('modal.backdrop', { includeHiddenElements: true });
    expect(backdrop).toBeDisabled();
    await user.press(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});
