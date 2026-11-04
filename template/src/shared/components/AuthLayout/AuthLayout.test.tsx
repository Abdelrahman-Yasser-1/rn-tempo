import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { AuthLayout } from './AuthLayout';

describe('AuthLayout', () => {
  it('renders the title, subtitle, content and footer', async () => {
    await renderWithProviders(
      <AuthLayout
        title="Sign in"
        subtitle="Welcome back"
        logo={<Text>Logo</Text>}
        footer={<Text>Footer link</Text>}
      >
        <Text>Form</Text>
      </AuthLayout>,
    );
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.getByText('Welcome back')).toBeOnTheScreen();
    expect(screen.getByText('Logo')).toBeOnTheScreen();
    expect(screen.getByText('Form')).toBeOnTheScreen();
    expect(screen.getByText('Footer link')).toBeOnTheScreen();
  });

  it('shows a header with a working back button when asked', async () => {
    const onBack = jest.fn();
    const { user } = await renderWithProviders(
      <AuthLayout title="Register" headerTitle="Create account" onBack={onBack} />,
    );
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
