import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from '@shared/components/Button';
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

  it('does not dismiss a sheet that was never presented', async () => {
    // gorhom ignores the next present() after a dismiss() on a never-presented modal.
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    await renderWithProviders(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    expect(dismiss).not.toHaveBeenCalled();
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

  it('renders a footer after the content', async () => {
    await renderWithProviders(
      <BottomSheet visible onClose={jest.fn()} testID="sheet" footer={<Button title="Apply" />}>
        <Text>Body</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('keeps the footer interactive', async () => {
    const onApply = jest.fn();
    const { user } = await renderWithProviders(
      <BottomSheet
        visible
        onClose={jest.fn()}
        footer={<Button title="Apply" onPress={onApply} />}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('renders no footer without one', async () => {
    await renderWithProviders(
      <BottomSheet visible onClose={jest.fn()} testID="sheet">
        <Text>Body</Text>
      </BottomSheet>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- absence check on a plain layout box
    expect(screen.queryByTestId('sheet.footer')).not.toBeOnTheScreen();
  });

  it('reserves the footer height at the end of the content', async () => {
    await renderWithProviders(
      <BottomSheet visible onClose={jest.fn()} testID="sheet" footer={<Text>Footer</Text>}>
        <Text>Body</Text>
      </BottomSheet>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout box without a role
    const footer = screen.getByTestId('sheet.footer');
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(footer, 'layout', { nativeEvent: { layout: { height: 88, width: 300 } } });
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout box without a role
    expect(screen.getByTestId('sheet.content')).toHaveStyle({ paddingBottom: 88 });
  });

  it('presents and dismisses as visible changes', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { rerender } = await renderWithProviders(
      <BottomSheet visible={false} onClose={jest.fn()} />,
    );
    expect(present).not.toHaveBeenCalled();
    present.mockClear();
    dismiss.mockClear();

    await rerender(<BottomSheet visible onClose={jest.fn()} />);
    expect(present).toHaveBeenCalledTimes(1);

    await rerender(<BottomSheet visible={false} onClose={jest.fn()} />);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('has no header or close button without a title', async () => {
    await renderWithProviders(<BottomSheet visible onClose={jest.fn()} />);
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeOnTheScreen();
  });

  it('does not make the sheet one accessible node, so screen readers reach its contents', async () => {
    const render = jest.spyOn(BottomSheetModal.prototype, 'render');
    await renderWithProviders(
      <BottomSheet visible onClose={jest.fn()}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    const [sheet] = render.mock.contexts as { props: { accessible?: boolean } }[];
    expect(sheet?.props.accessible).toBe(false);
  });
});
