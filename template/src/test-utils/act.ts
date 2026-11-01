import { act } from '@testing-library/react-native';

/**
 * Runs a state update or timer advance inside an async `act`, so React commits before the next
 * assertion. Returns a promise from a plain callback, which keeps lint's require-await happy.
 */
export function actAsync(update: () => void): Promise<void> {
  return act(() => {
    update();
    return Promise.resolve();
  });
}
