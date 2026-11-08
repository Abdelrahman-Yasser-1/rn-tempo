import { createStaticNavigation, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, screen, userEvent } from '@testing-library/react-native';

import { Button, Text } from '@shared/components';

function ListScreen() {
  const navigation = useNavigation<{ navigate: (name: 'Detail') => void }>();
  return (
    <Button
      title="Open detail"
      onPress={() => {
        navigation.navigate('Detail');
      }}
    />
  );
}

function DetailScreen() {
  return (
    <Text variant="title" accessibilityRole="header">
      Detail screen
    </Text>
  );
}

const Stack = createNativeStackNavigator({
  initialRouteName: 'List',
  screens: { List: ListScreen, Detail: DetailScreen },
});
const Navigation = createStaticNavigation(Stack);

// Smoke test for the static API of React Navigation 7 with a real native stack: render, navigate
// through `useNavigation()` (static screens get no `navigation` prop) and assert the new screen.
describe('integration: react-navigation', () => {
  test('renders the initial screen and navigates to another one', async () => {
    await render(<Navigation />);
    const user = userEvent.setup();

    expect(await screen.findByRole('button', { name: 'Open detail' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Open detail' }));

    expect(await screen.findByRole('header', { name: 'Detail screen' })).toBeOnTheScreen();
  });
});
