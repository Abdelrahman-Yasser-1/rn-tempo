import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DescriptionList } from './DescriptionList';

const ITEMS = [
  { key: 'name', label: 'Name', value: 'Ada Lovelace' },
  { key: 'city', label: 'City', value: 'London' },
];

describe('DescriptionList', () => {
  it('renders every pair', async () => {
    await renderWithProviders(<DescriptionList items={ITEMS} />);
    expect(screen.getByLabelText('Name, Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByLabelText('City, London')).toBeOnTheScreen();
  });

  it('puts a divider between rows only', async () => {
    await renderWithProviders(<DescriptionList items={ITEMS} testID="list" />);
    // Dividers are decorative and hidden from assistive tech, so they have no role to query.
    // eslint-disable-next-line no-restricted-syntax -- decorative views have no accessible role
    expect(screen.getByTestId('list').children).toHaveLength(3);
  });

  it('omits dividers when asked', async () => {
    await renderWithProviders(<DescriptionList items={ITEMS} dividers={false} testID="list" />);
    // eslint-disable-next-line no-restricted-syntax -- decorative views have no accessible role
    expect(screen.getByTestId('list').children).toHaveLength(2);
  });
});
