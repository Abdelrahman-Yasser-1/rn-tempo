import { screen } from '@testing-library/react-native';

// Decorative views have no accessible role, so testID is the only handle on them.
/* eslint-disable rn-tempo/discouraged-syntax -- decorative element: testID is the only handle */
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('shows the initials of the name when there is no image', async () => {
    await renderWithProviders(<Avatar name="ada lovelace" />);
    expect(screen.getByText('AL')).toBeOnTheScreen();
  });

  it('exposes the name as an image label', async () => {
    await renderWithProviders(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole('image', { name: 'Ada Lovelace' })).toBeOnTheScreen();
  });

  it('prefers an explicit accessibilityLabel over the name', async () => {
    await renderWithProviders(<Avatar name="Ada Lovelace" accessibilityLabel="Profile photo" />);
    expect(screen.getByRole('image', { name: 'Profile photo' })).toBeOnTheScreen();
  });

  it('is not an accessible image when neither name nor label is given', async () => {
    await renderWithProviders(<Avatar />);
    expect(screen.queryByRole('image')).not.toBeOnTheScreen();
  });

  it('renders the image instead of initials when a source is given', async () => {
    await renderWithProviders(
      <Avatar name="Ada Lovelace" source={{ uri: 'https://example.com/ada.png' }} testID="av" />,
    );
    expect(screen.getByTestId('av.image', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.queryByTestId('av.initials', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });

  it('tags the initials with a testID suffix', async () => {
    await renderWithProviders(<Avatar name="Grace Hopper" testID="av" />);
    expect(screen.getByTestId('av.initials', { includeHiddenElements: true })).toHaveTextContent(
      'GH',
    );
  });
});
