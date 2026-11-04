import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';
import { useState } from 'react';

import { pickDocument } from '@services/files/files';
import type { PickedFile } from '@services/files/types';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MultiFilePicker } from './MultiFilePicker';

type ModalInstance = { props: { onDismiss?: () => void } };

jest.mock('@services/files/files');

const mockedPick = jest.mocked(pickDocument);
const file = (name: string, size = 1000) => ({
  uri: `file:///${name}`,
  name,
  type: 'application/pdf',
  size,
});

function Harness({ maxFiles }: Readonly<{ maxFiles?: number }>) {
  const [files, setFiles] = useState<PickedFile[]>([]);

  return (
    <MultiFilePicker
      label="Attachments"
      value={files}
      onChange={setFiles}
      maxFiles={maxFiles}
      maxSizeMB={1}
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
});
