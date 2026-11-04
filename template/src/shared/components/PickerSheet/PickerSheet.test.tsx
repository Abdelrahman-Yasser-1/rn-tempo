import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PickerSheet } from './PickerSheet';

type ModalInstance = { props: { onDismiss?: () => void; accessible?: boolean } };

/** Makes `dismiss()` behave like the real sheet: it reports the dismissal through `onDismiss`. */
function dismissReportsOnDismiss() {
  return jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(
    this: ModalInstance,
  ) {
    this.props.onDismiss?.();
  });
}

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

  it('presents and dismisses as visible changes', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { rerender } = await renderWithProviders(
      <PickerSheet visible={false} title="Pick" onClose={jest.fn()} />,
    );
    expect(present).not.toHaveBeenCalled();
    await rerender(<PickerSheet visible title="Pick" onClose={jest.fn()} />);
    expect(present).toHaveBeenCalledTimes(1);
    dismiss.mockClear();
    await rerender(<PickerSheet visible={false} title="Pick" onClose={jest.fn()} />);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('does not merge its content into one accessibility node', async () => {
    // gorhom's default `accessible` merges everything inside into a single node for TalkBack.
    const render = jest.spyOn(BottomSheetModal.prototype, 'render');
    await renderWithProviders(
      <PickerSheet visible title="Pick" onClose={jest.fn()}>
        <Text>Body</Text>
      </PickerSheet>,
    );
    const modal = render.mock.contexts[0] as ModalInstance;
    expect(modal.props.accessible).toBe(false);
  });

  it('has no footer without onConfirm', async () => {
    await renderWithProviders(<PickerSheet visible title="Pick" onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeOnTheScreen();
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

  it('cancels without confirming and reports the close', async () => {
    dismissReportsOnDismiss();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { user } = await renderWithProviders(
      <PickerSheet visible title="Pick" onConfirm={onConfirm} onClose={onClose} />,
    );
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button without confirming', async () => {
    dismissReportsOnDismiss();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { user } = await renderWithProviders(
      <PickerSheet visible title="Pick" onConfirm={onConfirm} onClose={onClose} />,
    );
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Confirm when confirmDisabled', async () => {
    const { rerender } = await renderWithProviders(
      <PickerSheet
        visible
        title="Pick"
        onConfirm={jest.fn()}
        onClose={jest.fn()}
        confirmDisabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await rerender(<PickerSheet visible title="Pick" onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('calls the newest onConfirm without remounting the footer', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { user, rerender } = await renderWithProviders(
      <PickerSheet visible title="Pick" onConfirm={first} onClose={jest.fn()} />,
    );
    await rerender(<PickerSheet visible title="Pick" onConfirm={second} onClose={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('renders scrollable content', async () => {
    await renderWithProviders(
      <PickerSheet scrollable visible title="Pick" onClose={jest.fn()}>
        <Text>Long list</Text>
      </PickerSheet>,
    );
    expect(screen.getByText('Long list')).toBeOnTheScreen();
  });
});
