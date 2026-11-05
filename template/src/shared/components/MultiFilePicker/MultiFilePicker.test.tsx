import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { pickDocument, pickImage } from '@services/files/files';
import { FilePickError, type PickedFile } from '@services/files/types';
import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MultiFilePicker } from './MultiFilePicker';

type ModalInstance = { props: { onDismiss?: () => void } };

jest.mock('@services/files/files');
jest.mock('@services/linking/linking', () => ({
  openSettings: jest.fn(() => Promise.resolve(true)),
}));

const mockedPick = jest.mocked(pickDocument);
const mockedImage = jest.mocked(pickImage);
const file = (name: string, size = 1000) => ({
  uri: `file:///${name}`,
  name,
  type: 'application/pdf',
  size,
});

function Harness({
  maxFiles,
  initial = [],
  accept,
  isReadOnly,
  isDisabled,
}: Readonly<{
  maxFiles?: number;
  initial?: PickedFile[];
  accept?: readonly string[];
  isReadOnly?: boolean;
  isDisabled?: boolean;
}>) {
  const [files, setFiles] = useState<PickedFile[]>(initial);

  return (
    <MultiFilePicker
      label="Attachments"
      value={files}
      onChange={setFiles}
      maxFiles={maxFiles}
      maxSizeMB={1}
      accept={accept}
      readOnly={isReadOnly}
      disabled={isDisabled}
      testID="picker"
    />
  );
}

beforeEach(() => {
  jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(
    this: ModalInstance,
  ) {
    this.props.onDismiss?.();
  });
  mockedPick.mockReset();
  mockedImage.mockReset();
  jest.mocked(openSettings).mockClear();
  jest.spyOn(toast, 'show').mockImplementation(jest.fn());
  jest.spyOn(toast, 'error').mockImplementation(jest.fn());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MultiFilePicker', () => {
  it('adds files, skips the oversize ones and removes a file', async () => {
    mockedPick.mockResolvedValue([file('a.pdf'), file('big.pdf', 5_000_000), file('b.pdf')]);
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('a.pdf')).toBeOnTheScreen();
    expect(screen.getByText('b.pdf')).toBeOnTheScreen();
    expect(screen.queryByText('big.pdf')).not.toBeOnTheScreen();
    expect(screen.getByText('The file is larger than 1 MB.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(screen.queryByText('a.pdf')).not.toBeOnTheScreen();
  });

  it('stops at maxFiles, then disables the field', async () => {
    mockedPick.mockResolvedValue([file('a.pdf'), file('b.pdf'), file('c.pdf')]);
    const { user } = await renderWithProviders(<Harness maxFiles={2} />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('b.pdf')).toBeOnTheScreen();
    expect(screen.queryByText('c.pdf')).not.toBeOnTheScreen();
    expect(screen.getByText('You can add up to 2 files.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Attachments' })).toBeDisabled();
  });

  it('appends to the files already chosen and skips duplicates', async () => {
    mockedPick.mockResolvedValue([file('a.pdf'), file('b.pdf')]);
    const { user } = await renderWithProviders(<Harness initial={[file('a.pdf')]} />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('b.pdf')).toBeOnTheScreen();
    expect(screen.getAllByText('a.pdf')).toHaveLength(1);
    expect(screen.queryByText('The file is larger than 1 MB.')).not.toBeOnTheScreen();
  });

  it('skips files of the wrong type with a message', async () => {
    mockedPick.mockResolvedValue([
      file('a.pdf'),
      { uri: 'file:///x.zip', name: 'x.zip', type: 'application/zip', size: 5 },
    ]);
    const { user } = await renderWithProviders(<Harness accept={['application/pdf']} />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('a.pdf')).toBeOnTheScreen();
    expect(screen.queryByText('x.zip')).not.toBeOnTheScreen();
    expect(screen.getByText('This type of file is not allowed.')).toBeOnTheScreen();
  });

  it('shows the count and asks the library for the remaining room only', async () => {
    mockedImage.mockResolvedValue([]);
    const { user } = await renderWithProviders(<Harness maxFiles={3} initial={[file('a.pdf')]} />);
    expect(screen.getByText('1 of 3 files')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Choose from photos'));
    await waitFor(() => {
      expect(mockedImage).toHaveBeenCalledWith({ source: 'library', multiple: true, limit: 2 });
    });
  });

  it('enables the field again after a file is removed', async () => {
    const { user } = await renderWithProviders(<Harness maxFiles={1} initial={[file('a.pdf')]} />);
    expect(screen.getByRole('button', { name: 'Attachments' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(screen.getByRole('button', { name: 'Attachments' })).toBeEnabled();
    expect(screen.getByText('0 of 1 files')).toBeOnTheScreen();
  });

  it('keeps the list when the user cancels', async () => {
    mockedPick.mockResolvedValue([]);
    const { user } = await renderWithProviders(<Harness initial={[file('a.pdf')]} />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Browse files'));
    await waitFor(() => {
      expect(mockedPick).toHaveBeenCalled();
    });
    expect(screen.getByText('a.pdf')).toBeOnTheScreen();
  });

  it('shows a permission toast with an Open settings action', async () => {
    mockedImage.mockRejectedValue(new FilePickError('permissionDenied'));
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    await user.press(screen.getByText('Take a photo'));
    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledTimes(1);
    });
    const [options] = jest.mocked(toast.show).mock.calls[0] ?? [];
    expect(options?.actions?.[0]?.label).toBe('Open settings');
    options?.actions?.[0]?.onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('is disabled with no remove buttons', async () => {
    await renderWithProviders(<Harness initial={[file('a.pdf')]} isDisabled />);
    expect(screen.getByRole('button', { name: 'Attachments' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).not.toBeOnTheScreen();
    expect(screen.getByText('a.pdf')).toBeOnTheScreen();
  });

  it('is read-only: it cannot add or remove files', async () => {
    const { user } = await renderWithProviders(<Harness initial={[file('a.pdf')]} isReadOnly />);
    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Attachments' }));
    expect(screen.getByRole('button', { name: 'Attachments' })).not.toBeExpanded();
  });
});
