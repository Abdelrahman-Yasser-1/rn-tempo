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

  // The Unistyles mock does not resolve variant styles, so the divider line itself is covered by
  // the Storybook story; these check that every prop combination renders its children.
  it('renders its children with a divider', async () => {
    await renderWithProviders(
      <CardSection divider>
        <Text>Below the line</Text>
      </CardSection>,
    );
    expect(screen.getByText('Below the line')).toBeOnTheScreen();
  });

  it('renders its children with each padding token', async () => {
    await renderWithProviders(
      <>
        <CardSection padding="none">
          <Text>none</Text>
        </CardSection>
        <CardSection padding="xl" divider>
          <Text>xl</Text>
        </CardSection>
      </>,
    );
    expect(screen.getByText('none')).toBeOnTheScreen();
    expect(screen.getByText('xl')).toBeOnTheScreen();
  });
});
