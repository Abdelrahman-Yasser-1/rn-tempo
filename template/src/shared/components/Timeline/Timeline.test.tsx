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

  it('leaves out the timestamp and description when a step has none', async () => {
    await renderWithProviders(
      <Timeline items={[{ key: 'a', title: 'Shipped', status: 'done' }]} testID="timeline" />,
    );
    expect(screen.getByLabelText('Shipped, Completed')).toBeOnTheScreen();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('timeline.a.timestamp')).not.toBeOnTheScreen();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('timeline.a.description')).not.toBeOnTheScreen();
  });

  it('ignores empty strings in the announcement', async () => {
    await renderWithProviders(
      <Timeline
        items={[{ key: 'a', title: 'Packed', description: '', timestamp: '', status: 'upcoming' }]}
      />,
    );
    expect(screen.getByLabelText('Packed, Upcoming')).toBeOnTheScreen();
  });

  it('reads the timestamp after the description', async () => {
    await renderWithProviders(
      <Timeline
        items={[
          {
            key: 'a',
            title: 'Out for delivery',
            description: 'With the courier',
            timestamp: '14 Nov, 09:00',
            status: 'current',
          },
        ]}
      />,
    );
    expect(
      screen.getByLabelText('Out for delivery, With the courier, 14 Nov, 09:00, Current step'),
    ).toBeOnTheScreen();
  });

  it('renders nothing for an empty list', async () => {
    await renderWithProviders(<Timeline items={[]} testID="timeline" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- an empty container has no role query
    expect(screen.getByTestId('timeline').children).toHaveLength(0);
  });
});
