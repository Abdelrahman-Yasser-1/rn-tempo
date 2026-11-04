import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ScreenLayout } from './ScreenLayout';

describe('ScreenLayout', () => {
  it('renders the header, content and footer', async () => {
    const onBack = jest.fn();
    const { user } = await renderWithProviders(
      <ScreenLayout
        header={{ title: 'Settings', onBack }}
        footer={<Text>Footer action</Text>}
        scroll
        animated
      >
        <Text>Body</Text>
      </ScreenLayout>,
    );
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(screen.getByText('Footer action')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the header and footer when not given', async () => {
    await renderWithProviders(
      <ScreenLayout>
        <Text>Body</Text>
      </ScreenLayout>,
    );
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });
});
