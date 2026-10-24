import { render, screen } from '@testing-library/react-native';

import { Label } from './Label';

describe('Label', () => {
  it('AC-1: renders', () => {
    render(<Label text="a" isActive />);
    expect(screen.getByRole('text')).toBeTruthy();
  });
});
