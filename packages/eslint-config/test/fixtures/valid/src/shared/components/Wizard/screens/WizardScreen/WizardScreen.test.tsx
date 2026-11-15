import { render, screen } from '@testing-library/react-native';

import { WizardScreen } from './WizardScreen';

describe('WizardScreen', () => {
  it('AC-1: renders', () => {
    render(<WizardScreen />);
    expect(screen.getByRole('text')).toBeTruthy();
  });
});
