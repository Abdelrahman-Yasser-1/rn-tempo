import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Timeline } from './Timeline';

const ITEMS = [
  { key: 'placed', title: 'Order placed', timestamp: '12 Nov', status: 'done' },
  { key: 'packed', title: 'Packed', description: 'At the warehouse', status: 'current' },
  { key: 'shipped', title: 'Shipped', status: 'upcoming' },
] as const;

describe('Timeline', () => {
  it('renders every step with its details', async () => {
    await renderWithProviders(<Timeline items={ITEMS} />);
    expect(screen.getByText('Order placed')).toBeOnTheScreen();
    expect(screen.getByText('At the warehouse')).toBeOnTheScreen();
    expect(screen.getByText('12 Nov')).toBeOnTheScreen();
  });

  it('announces each step with its status', async () => {
    await renderWithProviders(<Timeline items={ITEMS} />);
    expect(screen.getByLabelText('Order placed, 12 Nov, Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Packed, At the warehouse, Current step')).toBeOnTheScreen();
    expect(screen.getByLabelText('Shipped, Upcoming')).toBeOnTheScreen();
  });
});
