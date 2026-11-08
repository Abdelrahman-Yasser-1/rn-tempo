import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

it('presses without awaiting', async () => {
  const { getByRole } = render(<View accessibilityRole="button" />);
  fireEvent.press(screen.getByRole('button'));
  waitFor(() => {
    expect(getByRole('button')).toBeOnTheScreen();
  });
});
