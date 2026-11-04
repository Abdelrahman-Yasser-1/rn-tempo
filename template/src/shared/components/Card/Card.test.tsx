import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Card } from './Card';

describe('Card', () => {
  it('renders children without a button role when not pressable', async () => {
    await renderWithProviders(
      <Card testID="card">
        <Text>Plain content</Text>
      </Card>,
    );
    expect(screen.getByText('Plain content')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('becomes a button and calls onPress when onPress is given', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Card onPress={onPress}>
        <Text>Tap me</Text>
      </Card>,
    );
    await user.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the media image above the content', async () => {
    await renderWithProviders(
      <Card
        media={{ source: { uri: 'https://example.com/cover.png' }, accessibilityLabel: 'Cover' }}
      >
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByRole('image', { name: 'Cover' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('draws the media overlay over the image', async () => {
    await renderWithProviders(
      <Card
        media={{
          source: { uri: 'https://example.com/cover.png' },
          accessibilityLabel: 'Cover',
          overlay: <Text>New</Text>,
        }}
      />,
    );
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('applies the media height', async () => {
    await renderWithProviders(
      <Card
        media={{
          source: { uri: 'https://example.com/c.png' },
          accessibilityLabel: 'Cover',
          height: 90,
        }}
      />,
    );
    expect(screen.getByRole('image', { name: 'Cover' })).toHaveStyle({ height: 90 });
  });

  it('has no media section without media', async () => {
    await renderWithProviders(<Card testID="card" />);
    // eslint-disable-next-line no-restricted-syntax -- the media wrapper has no role
    expect(screen.queryByTestId('card.media')).not.toBeOnTheScreen();
  });

  it('keeps media inside a pressable card pressable as one button', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Card
        accessibilityLabel="Open article"
        media={{ source: { uri: 'https://example.com/c.png' }, accessibilityLabel: 'Cover' }}
        onPress={onPress}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Open article' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
