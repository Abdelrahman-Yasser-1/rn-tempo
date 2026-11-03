import { render, screen } from '@testing-library/react-native';

import { Icon } from './Icon';

describe('Icon', () => {
  it('AC-1: renders', () => {
    render(<Icon size={24} />);
    expect(screen.getByRole('image')).toBeTruthy();
  });
});
