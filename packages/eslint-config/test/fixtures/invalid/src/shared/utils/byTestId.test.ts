import { screen } from '@testing-library/react-native';

describe('byTestId', () => {
  it('AC-1: queries by test id', () => {
    expect(screen.getByTestId('x')).toBeTruthy();
  });
});
