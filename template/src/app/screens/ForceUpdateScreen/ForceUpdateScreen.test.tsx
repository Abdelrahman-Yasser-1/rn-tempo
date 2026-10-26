import { screen } from '@testing-library/react-native';

import { openStore } from '@services/linking/linking';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ForceUpdateScreen } from './ForceUpdateScreen';

jest.mock('@services/linking/linking', () => ({ openStore: jest.fn(() => Promise.resolve(true)) }));

describe('ForceUpdateScreen', () => {
  test('explains the update and opens the store', async () => {
    const { user } = await renderWithProviders(<ForceUpdateScreen />);

    expect(screen.getByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Update' }));
    expect(openStore).toHaveBeenCalledTimes(1);
  });

  test('renders in Arabic', async () => {
    await renderWithProviders(<ForceUpdateScreen />, { language: 'ar' });

    expect(screen.getByRole('button', { name: 'تحديث' })).toBeOnTheScreen();
  });
});
