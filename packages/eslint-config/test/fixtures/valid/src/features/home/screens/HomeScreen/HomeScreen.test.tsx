import { render, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('AC-1: renders the title', () => {
    render(<HomeScreen />);
    renderWithProviders(<HomeScreen />);
    expect(screen.getByRole('text')).toBeTruthy();
  });
});
