import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { screen } from '@testing-library/react-native';

import { logger } from '@services/logger/logger';
import { Text } from '@shared/components';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ScreenErrorLayout } from './ScreenErrorLayout';

let shouldThrow = true;

function Broken() {
  if (shouldThrow) {
    throw new Error('screen exploded');
  }
  return <Text>Recovered</Text>;
}

function Healthy() {
  return <Text>Healthy tab</Text>;
}

function createStack(screen: () => React.JSX.Element) {
  return createNativeStackNavigator({
    screenOptions: { headerShown: false },
    screenLayout: ScreenErrorLayout,
    screens: { Inner: screen },
  });
}

function createTabs() {
  return createBottomTabNavigator({
    screenOptions: { headerShown: false },
    screens: {
      BrokenTab: { screen: createStack(Broken), options: { tabBarLabel: 'Broken tab' } },
      HealthyTab: { screen: createStack(Healthy), options: { tabBarLabel: 'Healthy tab label' } },
    },
  });
}

describe('ScreenErrorLayout', () => {
  beforeEach(() => {
    shouldThrow = true;
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isolates a throwing screen, keeps the tab bar working and names the route in the log', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
    const Tabs = createTabs().getComponent();
    const { user } = await renderWithProviders(<Tabs />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(logError).toHaveBeenCalledWith(
      'Unhandled render error in Inner',
      expect.any(Error),
      expect.any(String),
    );

    await user.press(screen.getByRole('button', { name: /Healthy tab label/ }));

    expect(await screen.findByText('Healthy tab')).toBeOnTheScreen();
  });

  it('re-renders the screen from Try again once the cause is fixed', async () => {
    const Tabs = createTabs().getComponent();
    const { user } = await renderWithProviders(<Tabs />);
    await user.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();

    shouldThrow = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Recovered')).toBeOnTheScreen();
  });
});
