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
});
