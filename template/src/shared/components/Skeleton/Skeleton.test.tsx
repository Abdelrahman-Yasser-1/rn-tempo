import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Bone } from '@shared/components/Bone';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('is a busy progress bar with the default loading label', async () => {
    await renderWithProviders(
      <Skeleton>
        <Bone />
      </Skeleton>,
    );
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeBusy();
  });

  it('uses a custom accessibility label when given', async () => {
    await renderWithProviders(
      <Skeleton accessibilityLabel="Loading profile">
        <Text>child</Text>
      </Skeleton>,
    );
    expect(screen.getByRole('progressbar', { name: 'Loading profile' })).toBeOnTheScreen();
  });

  it('renders its children', async () => {
    await renderWithProviders(
      <Skeleton>
        <Text>placeholder content</Text>
      </Skeleton>,
    );
    expect(screen.getByText('placeholder content')).toBeOnTheScreen();
  });

  it('reuses the outer container when nested instead of announcing twice', async () => {
    await renderWithProviders(
      <Skeleton>
        <Skeleton>
          <Text>inner</Text>
        </Skeleton>
      </Skeleton>,
    );
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByText('inner')).toBeOnTheScreen();
  });
});
