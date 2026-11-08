import { render, screen } from '@testing-library/react-native';

import { Label } from '@shared/components';

describe('integration: smoke', () => {
  it('renders in a nested test-utils folder', () => {
    render(<Label text="a" isActive />);
    expect(screen.getByRole('text')).toBeTruthy();
  });
});
