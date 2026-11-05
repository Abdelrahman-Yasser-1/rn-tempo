import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FileSourceSheet } from './FileSourceSheet';

type ModalInstance = { props: { onDismiss?: () => void } };

describe('FileSourceSheet', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists the given sources and reports the chosen one', async () => {
    const onSelect = jest.fn();
    const { user } = await renderWithProviders(
      <FileSourceSheet
        visible
        sources={['camera', 'files']}
        onSelect={onSelect}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Add a file' })).toBeOnTheScreen();
    expect(screen.queryByText('Choose from photos')).not.toBeOnTheScreen();
    await user.press(screen.getByText('Take a photo'));
    expect(onSelect).toHaveBeenCalledWith('camera');
  });

  it('lists every source in the given order and reports each one', async () => {
    const onSelect = jest.fn();
    const { user } = await renderWithProviders(
      <FileSourceSheet
        visible
        sources={['files', 'library', 'camera']}
        title="Pick a source"
        testID="sheet"
        onSelect={onSelect}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Pick a source' })).toBeOnTheScreen();
    await user.press(screen.getByText('Choose from photos'));
    await user.press(screen.getByText('Browse files'));
    expect(onSelect.mock.calls).toEqual([['library'], ['files']]);
  });

  it('does not close itself when a source is chosen', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const onClose = jest.fn();
    const { user } = await renderWithProviders(
      <FileSourceSheet visible sources={['files']} onSelect={jest.fn()} onClose={onClose} />,
    );
    await user.press(screen.getByText('Browse files'));
    expect(dismiss).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports the dismissal through onClose', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(
      this: ModalInstance,
    ) {
      this.props.onDismiss?.();
    });
    const onClose = jest.fn();
    const sheet = (isVisible: boolean) => (
      <FileSourceSheet
        visible={isVisible}
        sources={['files']}
        onSelect={jest.fn()}
        onClose={onClose}
      />
    );
    const { rerender } = await renderWithProviders(sheet(true));
    expect(onClose).not.toHaveBeenCalled();
    await rerender(sheet(false));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
