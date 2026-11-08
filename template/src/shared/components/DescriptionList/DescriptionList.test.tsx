import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Badge } from '../Badge';

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
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- decorative views have no accessible role
    expect(screen.getByTestId('list').children).toHaveLength(3);
  });

  it('omits dividers when asked', async () => {
    await renderWithProviders(<DescriptionList items={ITEMS} dividers={false} testID="list" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- decorative views have no accessible role
    expect(screen.getByTestId('list').children).toHaveLength(2);
  });

  it.each(['horizontal', 'vertical'] as const)(
    'renders every row in the %s layout',
    async (layout) => {
      await renderWithProviders(<DescriptionList items={ITEMS} layout={layout} />);
      expect(screen.getByLabelText('Name, Ada Lovelace')).toBeOnTheScreen();
      expect(screen.getByLabelText('City, London')).toBeOnTheScreen();
    },
  );

  it('renders node values and gives each row its key as testID suffix', async () => {
    await renderWithProviders(
      <DescriptionList
        items={[{ key: 'plan', label: 'Plan', value: <Badge label="Pro" /> }, ...ITEMS]}
        testID="list"
      />,
    );
    expect(screen.getByText('Pro')).toBeOnTheScreen();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('list.plan')).toBeOnTheScreen();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('list.city.value')).toHaveTextContent('London');
  });

  it('renders nothing but the container without items', async () => {
    await renderWithProviders(<DescriptionList items={[]} testID="list" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- an empty container has no role query
    expect(screen.getByTestId('list').children).toHaveLength(0);
  });
});
