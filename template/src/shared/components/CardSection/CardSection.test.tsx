import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Text } from '../Text';

import { CardSection } from './CardSection';

describe('CardSection', () => {
  it('renders its children', async () => {
    await renderWithProviders(
      <CardSection>
        <Text>Inside</Text>
      </CardSection>,
    );
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
});
