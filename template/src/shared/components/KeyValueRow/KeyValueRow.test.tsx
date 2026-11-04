import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Badge } from '../Badge';

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
});
