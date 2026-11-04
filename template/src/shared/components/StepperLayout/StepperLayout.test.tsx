import { act, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';

import { actAsync } from '@test-utils/act';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { StepperLayout } from './StepperLayout';
import type { StepperLayoutStep } from './types';

const STEPS: readonly StepperLayoutStep[] = [
  { key: 'one', label: 'One', content: <Text>First content</Text> },
  { key: 'two', label: 'Two', content: <Text>Second content</Text> },
];

describe('StepperLayout', () => {
  it('walks through the steps and submits on the last one', async () => {
    const onSubmit = jest.fn();
    const { user } = await renderWithProviders(
      <StepperLayout title="Create" steps={STEPS} onExit={jest.fn()} onSubmit={onSubmit} />,
    );
    expect(screen.getByText('First content')).toBeOnTheScreen();
    // Only the header back button exists on the first step.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Second content')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stays on the step when validation fails', async () => {
    const steps: readonly StepperLayoutStep[] = [
      { ...STEPS[0], validate: () => Promise.resolve(false) } as StepperLayoutStep,
      ...STEPS.slice(1),
    ];
    const { user } = await renderWithProviders(
      <StepperLayout steps={steps} onExit={jest.fn()} onSubmit={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('First content')).toBeOnTheScreen();
  });

  it('steps back from the header and leaves from the first step', async () => {
    const onExit = jest.fn();
    const { user } = await renderWithProviders(
      <StepperLayout title="Create" steps={STEPS} onExit={onExit} onSubmit={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Second content');

    // On the second step the header back button comes first, then the footer one.
    const [headerBack] = screen.getAllByRole('button', { name: 'Back' });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- getAllByRole throws when empty
    await user.press(headerBack!);
    expect(await screen.findByText('First content')).toBeOnTheScreen();
    expect(onExit).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows the success state when complete', async () => {
    const onDone = jest.fn();
    const { user } = await renderWithProviders(
      <StepperLayout
        steps={STEPS}
        onExit={jest.fn()}
        onSubmit={jest.fn()}
        isComplete
        success={{ title: 'All done', message: 'Saved.', doneLabel: 'Finish', onDone }}
      />,
    );
    expect(screen.getByText('All done')).toBeOnTheScreen();
    expect(screen.queryByText('First content')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('labels the primary action Next until the last step, then Submit', async () => {
    const { user } = await renderWithProviders(
      <StepperLayout steps={STEPS} onExit={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('button', { name: 'Submit' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeOnTheScreen();
  });

  it('disables Next while the gate is closed and does not move on', async () => {
    const { user } = await renderWithProviders(
      <StepperLayout steps={STEPS} onExit={jest.fn()} onSubmit={jest.fn()} canGoNext={false} />,
    );
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    await user.press(next);
    expect(screen.getByText('First content')).toBeOnTheScreen();
  });

  it('opens the gate again when canGoNext turns true', async () => {
    const { rerender } = await renderWithProviders(
      <StepperLayout steps={STEPS} onExit={jest.fn()} onSubmit={jest.fn()} canGoNext={false} />,
    );
    await rerender(<StepperLayout steps={STEPS} onExit={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('runs the validate of the current step before moving on', async () => {
    const validate = jest.fn(() => Promise.resolve(true));
    const steps: readonly StepperLayoutStep[] = [
      { ...STEPS[0], validate } as StepperLayoutStep,
      ...STEPS.slice(1),
    ];
    const { user } = await renderWithProviders(
      <StepperLayout steps={steps} onExit={jest.fn()} onSubmit={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Second content')).toBeOnTheScreen();
  });

  it('does not submit when the last step fails validation', async () => {
    const onSubmit = jest.fn();
    const steps: readonly StepperLayoutStep[] = [
      { ...STEPS[0], validate: () => Promise.resolve(false) } as StepperLayoutStep,
    ];
    const { user } = await renderWithProviders(
      <StepperLayout steps={steps} onExit={jest.fn()} onSubmit={onSubmit} />,
    );
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a busy Submit while the caller saves', async () => {
    await renderWithProviders(
      <StepperLayout
        steps={STEPS.slice(0, 1)}
        onExit={jest.fn()}
        onSubmit={jest.fn()}
        isSubmitting
      />,
    );
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeBusy();
    expect(submit).toBeDisabled();
  });

  it('disables the footer Back while submitting', async () => {
    await renderWithProviders(
      <StepperLayout
        steps={STEPS}
        initialStep={1}
        onExit={jest.fn()}
        onSubmit={jest.fn()}
        isSubmitting
        testID="wizard-screen"
      />,
    );
    // eslint-disable-next-line no-restricted-syntax -- two Back buttons; the footer one has a testID
    expect(screen.getByTestId('wizard-screen.back')).toBeDisabled();
  });

  it('starts on initialStep', async () => {
    await renderWithProviders(
      <StepperLayout steps={STEPS} initialStep={1} onExit={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.getByText('Second content')).toBeOnTheScreen();
    expect(screen.queryByText('First content')).not.toBeOnTheScreen();
  });

  it('hides the footer and the stepper in the success state', async () => {
    await renderWithProviders(
      <StepperLayout
        steps={STEPS}
        onExit={jest.fn()}
        onSubmit={jest.fn()}
        isComplete
        success={{ title: 'All done', doneLabel: 'Finish', onDone: jest.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('One, Current step')).not.toBeOnTheScreen();
  });

  it('keeps the steps while complete without a success definition', async () => {
    await renderWithProviders(
      <StepperLayout steps={STEPS} onExit={jest.fn()} onSubmit={jest.fn()} isComplete />,
    );
    expect(screen.getByText('First content')).toBeOnTheScreen();
  });

  it('passes the stepper variant and the testID parts through', async () => {
    await renderWithProviders(
      <StepperLayout
        steps={STEPS}
        variant="progress"
        onExit={jest.fn()}
        onSubmit={jest.fn()}
        testID="wizard-screen"
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 2' })).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('wizard-screen.next')).toBeOnTheScreen();
  });

  it('steps back on Android back, and leaves it to the system on the first step', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const onExit = jest.fn();
    await renderWithProviders(
      <StepperLayout steps={STEPS} initialStep={1} onExit={onExit} onSubmit={jest.fn()} />,
    );
    // Like the platform: newest listener first, the first one to return true consumes the press.
    const press = () =>
      [...addListener.mock.calls]
        .reverse()
        .some(([, listener]) => (listener as unknown as () => boolean)());

    let isConsumed = false;
    await actAsync(() => {
      isConsumed = press();
    });
    expect(isConsumed).toBe(true);
    expect(await screen.findByText('First content')).toBeOnTheScreen();
    expect(onExit).not.toHaveBeenCalled();

    await act(() => {
      isConsumed = press();
    });
    expect(isConsumed).toBe(false);
    addListener.mockRestore();
  });
});
