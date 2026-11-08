import { screen } from '@testing-library/react-native';

import { Badge } from '@shared/components/Badge';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { KeyValueRow } from './KeyValueRow';

describe('KeyValueRow', () => {
  it('shows the label and the text value', async () => {
    await renderWithProviders(<KeyValueRow label="Status" value="Active" />);
    expect(screen.getByText('Status')).toBeOnTheScreen();
    expect(screen.getByText('Active')).toBeOnTheScreen();
  });

  it('reads a text value together with its label', async () => {
    await renderWithProviders(<KeyValueRow label="City" value="Riyadh" />);
    expect(screen.getByLabelText('City, Riyadh')).toBeOnTheScreen();
  });

  it('renders a node value as is', async () => {
    await renderWithProviders(
      <KeyValueRow label="Plan" value={<Badge label="Pro" />} layout="vertical" />,
    );
    expect(screen.getByText('Pro')).toBeOnTheScreen();
  });

  it.each(['horizontal', 'vertical'] as const)(
    'reads label and value together in the %s layout',
    async (layout) => {
      await renderWithProviders(<KeyValueRow label="City" value="Riyadh" layout={layout} />);
      expect(screen.getByLabelText('City, Riyadh')).toBeOnTheScreen();
    },
  );

  it('combines a numeric value with its label', async () => {
    await renderWithProviders(<KeyValueRow label="Items" value={12} />);
    expect(screen.getByLabelText('Items, 12')).toBeOnTheScreen();
  });

  it('keeps a node value separate so its own controls stay reachable', async () => {
    await renderWithProviders(
      <KeyValueRow label="Plan" value={<Badge label="Pro" />} testID="row" />,
    );
    expect(screen.queryByLabelText('Plan, Pro')).not.toBeOnTheScreen();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('row')).toHaveProp('accessible', false);
  });

  it('passes the testID to the row and its parts', async () => {
    await renderWithProviders(<KeyValueRow label="City" value="Riyadh" testID="row" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('row.label')).toHaveTextContent('City');
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('row.value')).toHaveTextContent('Riyadh');
  });
});
