import { render, screen } from '@testing-library/react-native';

import { Step } from './Step';

describe('Step', () => {
  it('AC-1: renders', () => {
    render(<Step index={0} />);
    expect(screen.getByRole('text')).toBeTruthy();
  });
});
