import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FileSourceSheet } from './FileSourceSheet';

describe('FileSourceSheet', () => {
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
});
