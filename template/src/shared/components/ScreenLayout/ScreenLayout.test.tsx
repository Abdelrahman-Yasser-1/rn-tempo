import { screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ScreenLayout } from './ScreenLayout';

describe('ScreenLayout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('keeps the footer outside the scrolling content so it stays pinned', async () => {
    await renderWithProviders(
      <ScreenLayout scroll footer={<Text>Footer action</Text>} testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    /* eslint-disable rn-tempo/discouraged-syntax -- layout parts are addressed by testID */
    const content = screen.getByTestId('layout-screen.content');
    expect(within(content).getByText('Body')).toBeOnTheScreen();
    expect(within(content).queryByText('Footer action')).not.toBeOnTheScreen();
    expect(
      within(screen.getByTestId('layout-screen.footer')).getByText('Footer action'),
    ).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
  });

  it('renders no footer container without a footer', async () => {
    await renderWithProviders(
      <ScreenLayout testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout parts are addressed by testID
    expect(screen.queryByTestId('layout-screen.footer')).not.toBeOnTheScreen();
  });

  it('passes the testID to the header and screen root', async () => {
    await renderWithProviders(
      <ScreenLayout header={{ title: 'Settings' }} testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    /* eslint-disable rn-tempo/discouraged-syntax -- layout parts are addressed by testID */
    expect(screen.getByTestId('layout-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('layout-screen.header')).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
  });

  it('renders fixed content without scrolling', async () => {
    await renderWithProviders(
      <ScreenLayout testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('starts the animated content hidden and shifted down', async () => {
    await renderWithProviders(
      <ScreenLayout animated testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout parts are addressed by testID
    expect(screen.getByTestId('layout-screen.content')).toHaveStyle({
      opacity: 0,
      transform: [{ translateY: 16 }],
    });
  });

  it('shows the content in place without animation', async () => {
    await renderWithProviders(
      <ScreenLayout testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout parts are addressed by testID
    expect(screen.getByTestId('layout-screen.content')).toHaveStyle({ opacity: 1 });
  });

  it('skips the entrance when reduced motion is on', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    await renderWithProviders(
      <ScreenLayout animated testID="layout-screen">
        <Text>Body</Text>
      </ScreenLayout>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- layout parts are addressed by testID
    expect(screen.getByTestId('layout-screen.content')).toHaveStyle({
      opacity: 1,
      transform: [{ translateY: 0 }],
    });
  });
});
