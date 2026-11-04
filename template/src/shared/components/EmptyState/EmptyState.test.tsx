import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { EmptyState } from './EmptyState';

/** The default Icon renders an svg root, so its count tells whether the icon or art is shown. */
function countSvgs(): number {
  return JSON.stringify(screen.toJSON()).split('RNSVGSvgView').length - 1;
}

describe('EmptyState', () => {
  it('shows its title', async () => {
    await renderWithProviders(<EmptyState title="No orders yet" />);
    expect(screen.getByText('No orders yet')).toBeOnTheScreen();
  });

  it('shows the message only when given', async () => {
    await renderWithProviders(<EmptyState title="Empty" message="Place your first order" />);
    expect(screen.getByText('Place your first order')).toBeOnTheScreen();
  });

  it('omits the message when not given', async () => {
    await renderWithProviders(<EmptyState title="Empty" />);
    expect(screen.queryByText('Place your first order')).not.toBeOnTheScreen();
  });

  it('renders an action button and calls onAction when pressed', async () => {
    const onAction = jest.fn();
    const { user } = await renderWithProviders(
      <EmptyState title="Empty" actionLabel="Add item" onAction={onAction} />,
    );
    await user.press(screen.getByRole('button', { name: 'Add item' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('needs both actionLabel and onAction to show the action', async () => {
    await renderWithProviders(<EmptyState title="Empty" actionLabel="Add item" />);
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeOnTheScreen();
  });

  it('shows the default icon when there is no illustration', async () => {
    await renderWithProviders(<EmptyState title="Empty" />);
    expect(screen.getByText('Empty')).toBeOnTheScreen();
    expect(countSvgs()).toBe(1);
  });

  it('replaces the icon with the illustration', async () => {
    await renderWithProviders(<EmptyState title="Empty" illustration={<Text>Art</Text>} />);
    expect(screen.getByText('Art')).toBeOnTheScreen();
    expect(countSvgs()).toBe(0);
  });
});
