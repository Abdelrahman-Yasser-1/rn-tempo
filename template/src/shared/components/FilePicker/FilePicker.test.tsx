import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { pickDocument, pickImage } from '@services/files/files';
import { FilePickError, type PickedFile } from '@services/files/types';
import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FilePicker } from './FilePicker';

type ModalInstance = { props: { onDismiss?: () => void } };

jest.mock('@services/files/files');
jest.mock('@services/linking/linking', () => ({
  openSettings: jest.fn(() => Promise.resolve(true)),
}));

const mockedPick = jest.mocked(pickDocument);
const mockedImage = jest.mocked(pickImage);
const pdf = {
  uri: 'file:///c.pdf',
  name: 'contract.pdf',
  type: 'application/pdf',
  size: 3_000_000,
};

function Harness({
  initial = null,
  maxSizeMB,
  accept,
  isReadOnly,
  isDisabled,
}: Readonly<{
  initial?: PickedFile | null;
  maxSizeMB?: number;
  accept?: readonly string[];
  isReadOnly?: boolean;
  isDisabled?: boolean;
}>) {
  const [file, setFile] = useState<PickedFile | null>(initial);

  return (
    <FilePicker
      label="Attachment"
      value={file}
      onChange={setFile}
      maxSizeMB={maxSizeMB}
      accept={accept}
      readOnly={isReadOnly}
      disabled={isDisabled}
      testID="picker"
    />
  );
}

beforeEach(() => {
  // Like the real sheet, dismissing reports it through `onDismiss`.
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

describe('FilePicker', () => {
  it('shows the file chosen in the file browser, then removes it', async () => {
    mockedPick.mockResolvedValue([pdf]);
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('contract.pdf')).toBeOnTheScreen();
    expect(screen.getByText('2.9 MB')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove contract.pdf' }));
    expect(screen.queryByText('contract.pdf')).not.toBeOnTheScreen();
  });

  it('refuses a file over the size limit with a message', async () => {
    mockedPick.mockResolvedValue([pdf]);
    const { user } = await renderWithProviders(<Harness maxSizeMB={1} />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    await waitFor(() => {
      expect(screen.getByText('The file is larger than 1 MB.')).toBeOnTheScreen();
    });
    expect(screen.queryByText('contract.pdf')).not.toBeOnTheScreen();
  });

  it('offers only the file browser when no images are accepted', async () => {
    await renderWithProviders(
      <FilePicker label="Contract" accept={['application/pdf']} onChange={jest.fn()} />,
    );
    expect(screen.getByText('Browse files')).toBeOnTheScreen();
    expect(screen.queryByText('Take a photo')).not.toBeOnTheScreen();
  });

  it('shows the name and size of a photo from the library with an image icon row', async () => {
    mockedImage.mockResolvedValue([
      { uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg', size: 1536 },
    ]);
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Choose from photos'));
    expect(await screen.findByText('p.jpg')).toBeOnTheScreen();
    expect(screen.getByText('1.5 KB')).toBeOnTheScreen();
    expect(mockedImage).toHaveBeenCalledWith({
      source: 'library',
      multiple: false,
      limit: undefined,
    });
  });

  it('takes a photo with the camera', async () => {
    mockedImage.mockResolvedValue([
      { uri: 'file:///c.jpg', name: 'c.jpg', type: 'image/jpeg', size: 10 },
    ]);
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Take a photo'));
    expect(await screen.findByText('c.jpg')).toBeOnTheScreen();
    expect(mockedImage).toHaveBeenCalledWith(expect.objectContaining({ source: 'camera' }));
  });

  it('replaces the chosen file when another is picked', async () => {
    mockedPick.mockResolvedValue([{ ...pdf, uri: 'file:///d.pdf', name: 'second.pdf' }]);
    const { user } = await renderWithProviders(<Harness initial={pdf} />);
    expect(screen.getByText('Replace file')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('second.pdf')).toBeOnTheScreen();
    expect(screen.queryByText('contract.pdf')).not.toBeOnTheScreen();
  });

  it('shows the placeholder while empty', async () => {
    await renderWithProviders(<Harness />);
    expect(screen.getByText('Choose a file')).toBeOnTheScreen();
  });

  it('refuses a file of the wrong type with a message, and clears it on a valid pick', async () => {
    mockedPick.mockResolvedValueOnce([pdf]);
    const { user } = await renderWithProviders(<Harness accept={['image/*', 'text/plain']} />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('This type of file is not allowed.')).toBeOnTheScreen();
    expect(screen.queryByText('contract.pdf')).not.toBeOnTheScreen();

    mockedPick.mockResolvedValueOnce([
      { uri: 'file:///n.txt', name: 'n.txt', type: 'text/plain', size: 4 },
    ]);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('n.txt')).toBeOnTheScreen();
    expect(screen.queryByText('This type of file is not allowed.')).not.toBeOnTheScreen();
  });

  it('clears the error when the file is removed', async () => {
    mockedPick.mockResolvedValue([pdf]);
    const { user } = await renderWithProviders(<Harness initial={pdf} maxSizeMB={1} />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('The file is larger than 1 MB.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove contract.pdf' }));
    expect(screen.queryByText('The file is larger than 1 MB.')).not.toBeOnTheScreen();
  });

  it('keeps the current file when the user cancels the picker', async () => {
    mockedPick.mockResolvedValue([]);
    const { user } = await renderWithProviders(<Harness initial={pdf} />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    await waitFor(() => {
      expect(mockedPick).toHaveBeenCalled();
    });
    expect(screen.getByText('contract.pdf')).toBeOnTheScreen();
  });

  it('opens the native picker only once the sheet has dismissed', async () => {
    mockedPick.mockResolvedValue([pdf]);
    const onDismissSpy = jest
      .spyOn(BottomSheetModal.prototype, 'dismiss')
      .mockImplementation(jest.fn());
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(onDismissSpy).toHaveBeenCalled();
    expect(mockedPick).not.toHaveBeenCalled();

    const instance = onDismissSpy.mock.contexts[0] as ModalInstance;
    await act(() => {
      instance.props.onDismiss?.();
    });

    expect(mockedPick).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('contract.pdf')).toBeOnTheScreen();
  });

  it('shows a permission toast with an Open settings action', async () => {
    mockedImage.mockRejectedValue(new FilePickError('permissionDenied'));
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Take a photo'));
    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledTimes(1);
    });
    const [options] = jest.mocked(toast.show).mock.calls[0] ?? [];
    expect(options?.title).toBe('Allow access in Settings to use the camera or your photos.');
    expect(options?.actions?.[0]?.label).toBe('Open settings');
    options?.actions?.[0]?.onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('toasts when there is no camera', async () => {
    mockedImage.mockRejectedValue(new FilePickError('cameraUnavailable'));
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Take a photo'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No camera is available on this device.');
    });
  });

  it('is disabled with no remove button', async () => {
    await renderWithProviders(<Harness initial={pdf} isDisabled />);
    expect(screen.getByRole('button', { name: 'Attachment' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove contract.pdf' })).not.toBeOnTheScreen();
    expect(screen.getByText('contract.pdf')).toBeOnTheScreen();
  });

  it('is read-only: it cannot open the sheet or remove the file', async () => {
    const { user } = await renderWithProviders(<Harness initial={pdf} isReadOnly />);
    expect(screen.queryByRole('button', { name: 'Remove contract.pdf' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    expect(screen.getByRole('button', { name: 'Attachment' })).not.toBeExpanded();
    expect(mockedPick).not.toHaveBeenCalled();
  });

  it('shows an error text from the form over its own', async () => {
    await renderWithProviders(
      <FilePicker label="Attachment" errorText="Required" onChange={jest.fn()} testID="picker" />,
    );
    expect(screen.getByText('Required')).toBeOnTheScreen();
  });
});
