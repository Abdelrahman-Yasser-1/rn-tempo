import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label as an accessible element', async () => {
    await renderWithProviders(<Badge label="New" testID="badge" />);
    expect(screen.getByLabelText('New')).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('shows the exact count up to max', async () => {
    await renderWithProviders(<Badge count={7} />);
    expect(screen.getByLabelText('7')).toBeOnTheScreen();
  });

  it('caps the count with a plus sign above max', async () => {
    await renderWithProviders(<Badge count={120} testID="badge" />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('respects a custom max', async () => {
    await renderWithProviders(<Badge count={10} max={9} />);
    expect(screen.getByLabelText('9+')).toBeOnTheScreen();
  });

  it('prefers count over label when both are given', async () => {
    await renderWithProviders(<Badge label="ignored" count={3} />);
    expect(screen.getByLabelText('3')).toBeOnTheScreen();
    expect(screen.queryByText('ignored')).not.toBeOnTheScreen();
  });

  it('uses an explicit accessibilityLabel over the visible text', async () => {
    await renderWithProviders(<Badge count={5} accessibilityLabel="5 unread messages" />);
    expect(screen.getByLabelText('5 unread messages')).toBeOnTheScreen();
  });
});
