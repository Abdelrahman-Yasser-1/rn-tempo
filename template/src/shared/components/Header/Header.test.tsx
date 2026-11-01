import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Header } from './Header';

describe('Header', () => {
  it('exposes the title as a header', async () => {
    await renderWithProviders(<Header title="Profile" />);
    expect(screen.getByRole('header', { name: 'Profile' })).toBeOnTheScreen();
  });

  it('shows no back button without onBack', async () => {
    await renderWithProviders(<Header title="Home" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('calls onBack from the default back button', async () => {
    const onBack = jest.fn();
    const { user } = await renderWithProviders(<Header title="Profile" onBack={onBack} />);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('uses a custom back label when given', async () => {
    await renderWithProviders(<Header title="Profile" onBack={jest.fn()} backLabel="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('renders trailing actions', async () => {
    await renderWithProviders(<Header title="Edit" right={<Text>Save</Text>} />);
    expect(screen.getByText('Save')).toBeOnTheScreen();
  });
});
