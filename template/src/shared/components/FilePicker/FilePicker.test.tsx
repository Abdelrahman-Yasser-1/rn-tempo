import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { pickDocument } from '@services/files/files';
import type { PickedFile } from '@services/files/types';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FilePicker } from './FilePicker';

type ModalInstance = { props: { onDismiss?: () => void } };

jest.mock('@services/files/files');

const mockedPick = jest.mocked(pickDocument);
const pdf = {
  uri: 'file:///c.pdf',
  name: 'contract.pdf',
  type: 'application/pdf',
  size: 3_000_000,
};

function Harness({
  initial = null,
  maxSizeMB,
}: Readonly<{ initial?: PickedFile | null; maxSizeMB?: number }>) {
  const [file, setFile] = useState<PickedFile | null>(initial);

  return (
    <FilePicker
      label="Attachment"
      value={file}
      onChange={setFile}
      maxSizeMB={maxSizeMB}
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
});
