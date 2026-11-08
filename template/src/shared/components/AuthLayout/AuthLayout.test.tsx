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

  it('shows no header unless a title or back handler is given', async () => {
    await renderWithProviders(<AuthLayout title="Sign in" testID="login-screen" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- header is addressed by testID
    expect(screen.queryByTestId('login.header')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeOnTheScreen();
  });

  it('derives the header testID from the screen root testID', async () => {
    await renderWithProviders(
      <AuthLayout
        title="Reset"
        headerTitle="Forgot password"
        onBack={jest.fn()}
        testID="forgot-password-screen"
      />,
    );
    /* eslint-disable rn-tempo/discouraged-syntax -- Maestro flows address these IDs */
    expect(screen.getByTestId('forgot-password-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password.header')).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax */
  });

  it('shows the header with only a back button', async () => {
    const onBack = jest.fn();
    const { user } = await renderWithProviders(
      <AuthLayout title="Register" onBack={onBack} testID="register-screen" />,
    );
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a header title without a back button', async () => {
    await renderWithProviders(<AuthLayout title="Register" headerTitle="Create account" />);
    expect(screen.getByRole('header', { name: 'Create account' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeOnTheScreen();
  });

  it('leaves out the logo and subtitle when they are not given', async () => {
    await renderWithProviders(
      <AuthLayout title="Sign in" subtitle="">
        <Text>Form</Text>
      </AuthLayout>,
    );
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.getByText('Form')).toBeOnTheScreen();
    expect(screen.queryByText('Logo')).not.toBeOnTheScreen();
  });
});
