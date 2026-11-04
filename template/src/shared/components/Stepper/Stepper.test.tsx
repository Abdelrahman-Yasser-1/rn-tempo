import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Stepper } from './Stepper';

const STEPS = [
  { key: 'account', label: 'Account' },
  { key: 'profile', label: 'Profile' },
  { key: 'review', label: 'Review' },
] as const;

describe('Stepper', () => {
  it('renders numbered steps with their status announced', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={1} testID="stepper" />);
    expect(screen.getByLabelText('Account, Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Profile, Current step')).toBeOnTheScreen();
    expect(screen.getByLabelText('Review, Upcoming')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('renders the progress variant as a progressbar with "Step n of m"', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={1} variant="progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Step 2 of 3' });
    expect(bar).toBeOnTheScreen();
    expect(bar).toHaveProp('accessibilityValue', { min: 1, max: 3, now: 2 });
  });

  it('clamps a current index outside the steps', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={9} variant="progress" />);
    expect(screen.getByRole('progressbar', { name: 'Step 3 of 3' })).toBeOnTheScreen();
  });
});
