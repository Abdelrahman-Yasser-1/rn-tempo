import { screen } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SectionHeader } from './SectionHeader';

jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

describe('SectionHeader', () => {
  it('exposes the title as a header with its subtitle', async () => {
    await renderWithProviders(<SectionHeader title="Recent" subtitle="Last 7 days" />);
    expect(screen.getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
    expect(screen.getByText('Last 7 days')).toBeOnTheScreen();
  });

  it('has no link without an action', async () => {
    await renderWithProviders(<SectionHeader title="Recent" />);
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
  });

  it('runs the action link', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <SectionHeader title="Recent" action={{ label: 'See all', onPress }} />,
    );
    await user.press(screen.getByRole('link', { name: 'See all' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens the action href through openUrlSafe', async () => {
    const { user } = await renderWithProviders(
      <SectionHeader title="Help" action={{ label: 'Open docs', href: 'https://example.test' }} />,
    );
    await user.press(screen.getByRole('link', { name: 'Open docs' }));
    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test');
  });

  it('shows no subtitle when it is empty', async () => {
    await renderWithProviders(<SectionHeader title="Recent" subtitle="" testID="section" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('section.subtitle')).not.toBeOnTheScreen();
  });
});
