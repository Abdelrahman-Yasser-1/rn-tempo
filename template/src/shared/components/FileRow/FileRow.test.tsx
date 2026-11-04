import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FileRow } from './FileRow';

const file = { uri: 'file:///r.pdf', name: 'report.pdf', type: 'application/pdf', size: 1_572_864 };

describe('FileRow', () => {
  it('shows the name and the size, and removes the file', async () => {
    const onRemove = jest.fn();
    const { user } = await renderWithProviders(<FileRow file={file} onRemove={onRemove} />);
    expect(screen.getByText('report.pdf')).toBeOnTheScreen();
    expect(screen.getByText('1.5 MB')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('has no remove button when read-only', async () => {
    await renderWithProviders(<FileRow file={file} />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
