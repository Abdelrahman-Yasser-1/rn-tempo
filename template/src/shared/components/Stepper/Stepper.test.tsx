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

  it('shows a number only on steps that are not done', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={2} />);
    // Done steps show a check instead of their number.
    expect(screen.queryByText('1')).not.toBeOnTheScreen();
    expect(screen.queryByText('2')).not.toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Account, Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Profile, Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Review, Current step')).toBeOnTheScreen();
  });

  it('marks only the current step as selected', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={1} />);
    expect(screen.getByLabelText('Profile, Current step')).toBeSelected();
    expect(screen.getByLabelText('Account, Completed')).not.toBeSelected();
    expect(screen.getByLabelText('Review, Upcoming')).not.toBeSelected();
  });

  it('moves the current step when the prop changes', async () => {
    const { rerender } = await renderWithProviders(<Stepper steps={STEPS} current={0} />);
    expect(screen.getByLabelText('Account, Current step')).toBeOnTheScreen();
    await rerender(<Stepper steps={STEPS} current={1} />);
    expect(screen.getByLabelText('Account, Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Profile, Current step')).toBeOnTheScreen();
  });

  it('clamps a negative current index to the first step', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={-4} variant="progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Step 1 of 3' });
    expect(bar).toHaveProp('accessibilityValue', { min: 1, max: 3, now: 1 });
  });

  it('shows the step text of the progress variant and passes the testID', async () => {
    await renderWithProviders(
      <Stepper steps={STEPS} current={0} variant="progress" testID="stepper" />,
    );
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('stepper.label')).toHaveTextContent('Step 1 of 3');
  });

  it('does not list the labels of a progress stepper as steps', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={0} variant="progress" />);
    expect(screen.queryByLabelText('Account, Current step')).not.toBeOnTheScreen();
  });

  it('suffixes each numbered step testID with its key', async () => {
    await renderWithProviders(<Stepper steps={STEPS} current={0} testID="stepper" />);
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('stepper.profile')).toBeOnTheScreen();
  });
});
