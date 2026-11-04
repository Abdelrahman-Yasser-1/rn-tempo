import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

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
});
