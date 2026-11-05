import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Screen } from './Screen';

// The safe-area container has no role, so its testID is the only handle on it.
/* eslint-disable no-restricted-syntax -- safe-area container: testID is the only handle */
describe('Screen', () => {
  it('renders its children inside a safe-area container', async () => {
    await renderWithProviders(
      <Screen testID="screen">
        <Text>Body</Text>
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toHaveProp('edges', {
      top: 'additive',
      bottom: 'additive',
      left: 'off',
      right: 'off',
    });
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('honours custom safe-area edges', async () => {
    await renderWithProviders(
      <Screen testID="screen" safeAreaEdges={['bottom']}>
        <Text>Body</Text>
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toHaveProp('edges', {
      top: 'off',
      bottom: 'additive',
      left: 'off',
      right: 'off',
    });
  });

  it('wraps children in a scroll view for the scroll preset', async () => {
    await renderWithProviders(
      <Screen preset="scroll" testID="screen">
        <Text>Long content</Text>
      </Screen>,
    );
    expect(screen.getByText('Long content')).toBeOnTheScreen();
  });

  it('renders a keyboard-aware scroll screen', async () => {
    await renderWithProviders(
      <Screen preset="scroll" keyboardAware testID="screen">
        <Text>Form</Text>
      </Screen>,
    );
    expect(screen.getByText('Form')).toBeOnTheScreen();
  });

  it('renders a keyboard-aware fixed screen', async () => {
    await renderWithProviders(
      <Screen keyboardAware testID="screen">
        <Text>Fixed form</Text>
      </Screen>,
    );
    expect(screen.getByText('Fixed form')).toBeOnTheScreen();
  });
});
