import { render, screen } from '@testing-library/react-native';

import { App } from './App';

test('renders the app root', async () => {
  await render(<App />);

  expect(screen.root).toBeOnTheScreen();
});
