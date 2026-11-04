import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SectionHeader } from './SectionHeader';

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
});
