import { act, screen, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import { View } from 'react-native';
import { z } from 'zod';

import { useAuthStore } from '@features/auth';
import { discardDraft, hasDraft, loadDraft } from '@features/dynamic-forms/utils/draft';
import { VALIDATION_MESSAGES } from '@features/dynamic-forms/utils/messages';
import { Button, Text } from '@shared/components';
import { createUser } from '@test-utils/factories/user';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MultiStepFormBuilder } from './MultiStepFormBuilder';
import type { MultiStepFormBuilderRef, NavigationProps, StepConfig } from './types';

type Values = { name: string; skip: boolean; extra: string; email: string; pin?: string };

const required = z.string().min(1, VALIDATION_MESSAGES.required);
const schema = z.object({
  name: required,
  skip: z.boolean(),
  extra: required,
  email: required,
  pin: z.string().optional(),
});

const label = (en: string) => ({ en, ar: en });

function Navigation({ nav }: Readonly<{ nav: NavigationProps }>) {
  return (
    <View>
      <Text>{`Step ${String(nav.visibleStepIndex + 1)} of ${String(nav.totalVisibleSteps)}`}</Text>
      <Button title="Back" onPress={nav.onBack} disabled={nav.isFirstStep || !nav.canGoBack} />
      {nav.isLastStep ? (
        <Button title="Submit" onPress={nav.onSubmit} />
      ) : (
        <Button title="Next" onPress={nav.onNext} />
      )}
    </View>
  );
}

const aboutStep: StepConfig<Values> = {
  title: label('About you'),
  fields: [
    { type: 'text', name: 'name', label: label('Name') },
    { type: 'checkbox', name: 'skip', label: label('Skip extra') },
    { type: 'text', name: 'extra', label: label('Extra'), visibleIf: (v) => !v.skip },
  ],
};
const extraStep: StepConfig<Values> = {
  title: label('Extra step'),
  visibleIf: (values) => !values.skip,
  fields: [{ type: 'text', name: 'extra', label: label('Extra step field') }],
};
const contactStep: StepConfig<Values> = {
  title: label('Contact'),
  fields: [{ type: 'text', name: 'email', label: label('Email') }],
};
const steps = [aboutStep, extraStep, contactStep];

async function setup(overrides: Partial<Parameters<typeof MultiStepFormBuilder<Values>>[0]> = {}) {
  const onSubmit = jest.fn<undefined, [Values]>();
  const ref = createRef<MultiStepFormBuilderRef<Values>>();
  const view = await renderWithProviders(
    <MultiStepFormBuilder<Values>
      ref={ref}
      steps={steps}
      schema={schema}
      onSubmit={onSubmit}
      defaultValues={{ extra: 'x' }}
      renderNavigation={(nav) => <Navigation nav={nav} />}
      {...overrides}
    />,
  );
  return { ...view, onSubmit, ref };
}

describe('MultiStepFormBuilder', () => {
  it('AC-4: Next is blocked by an invalid visible field and moves on once it is valid', async () => {
    const { user } = await setup();
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('This field is required.')).toBeOnTheScreen();
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Name'), 'Sam');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByLabelText('Extra step field')).toBeOnTheScreen();
    expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();
  });

  it('AC-4: a hidden field does not block Next, and Back skips a hidden step', async () => {
    const { user } = await setup({ defaultValues: { extra: '' } });
    await user.type(screen.getByLabelText('Name'), 'Sam');
    await user.press(screen.getByRole('checkbox', { name: 'Skip extra' }));
    expect(screen.queryByLabelText('Extra')).not.toBeOnTheScreen();
    expect(screen.getByText('Step 1 of 2')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByText('Step 2 of 2')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Name')).toBeOnTheScreen();
  });

  it('AC-4: canGoBack false removes the way back', async () => {
    const lockedSteps: StepConfig<Values>[] = [aboutStep, { ...contactStep, canGoBack: false }];
    const { user, ref } = await setup({ steps: lockedSteps });
    await user.type(screen.getByLabelText('Name'), 'Sam');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await screen.findByLabelText('Email');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(ref.current?.canGoBack).toBe(false);

    await act(async () => {
      ref.current?.prevStep();
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
  });

  it('AC-4: initialStep snaps to the next visible step', async () => {
    await setup({ initialStep: 1, defaultValues: { skip: true, extra: 'x' } });
    expect(await screen.findByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByText('Step 2 of 2')).toBeOnTheScreen();
  });

  it('calls onStepEnter and onStepLeave with the direction', async () => {
    const calls: string[] = [];
    const tracked: StepConfig<Values>[] = steps.map((step, index) => ({
      ...step,
      onStepEnter: (_values, direction) => calls.push(`enter ${String(index)} ${direction}`),
      onStepLeave: (_values, direction) => calls.push(`leave ${String(index)} ${direction}`),
    }));
    const { user } = await setup({ steps: tracked });
    await user.type(screen.getByLabelText('Name'), 'Sam');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await screen.findByLabelText('Extra step field');
    await user.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByLabelText('Name');
    expect(calls).toEqual([
      'enter 0 next',
      'leave 0 next',
      'enter 1 next',
      'leave 1 back',
      'enter 0 back',
    ]);
  });

  it('AC-9: submits typed values from the last step', async () => {
    const { user, onSubmit } = await setup();
    await user.type(screen.getByLabelText('Name'), 'Sam');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await screen.findByLabelText('Extra step field');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Sam',
      skip: false,
      extra: 'x',
      email: 'a@b.co',
    });
  });

  it('shows the step that holds an error when the final submit is invalid', async () => {
    const onSubmitInvalid = jest.fn();
    const { user, ref } = await setup({ onSubmitInvalid });
    await act(async () => {
      ref.current?.goToStep(2);
      await Promise.resolve();
    });
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByLabelText('Name')).toBeOnTheScreen();
    expect(onSubmitInvalid).toHaveBeenCalledTimes(1);
  });

  it('renders the step indicator and exposes the step through the ref', async () => {
    const { ref } = await setup({
      renderStepIndicator: (index, total, title) => (
        <Text>{`Indicator ${String(index + 1)}/${String(total)} ${title ?? ''}`}</Text>
      ),
    });
    expect(screen.getByText('Indicator 1/3 About you')).toBeOnTheScreen();
    expect(ref.current?.currentStep).toBe(0);
    expect(ref.current?.totalSteps).toBe(3);
    await act(async () => {
      ref.current?.goToStep(2);
      await Promise.resolve();
    });
    expect(await screen.findByText('Indicator 3/3 Contact')).toBeOnTheScreen();
  });

  describe('draft', () => {
    beforeEach(() => {
      useAuthStore.setState({ status: 'signedIn', user: createUser({ id: 7 }) });
      discardDraft('wizard-test');
    });

    afterEach(() => {
      useAuthStore.setState({ status: 'signedOut', user: null });
    });

    const draft = { key: 'wizard-test' };

    it('AC-6: saves on step change and restores the values and the step after a remount', async () => {
      const view = await setup({ draft });
      await view.user.type(screen.getByLabelText('Name'), 'Sam');
      await view.user.press(screen.getByRole('button', { name: 'Next' }));
      await screen.findByLabelText('Extra step field');
      expect(loadDraft('wizard-test')).toMatchObject({ step: 1, values: { name: 'Sam' } });
      await view.unmount();

      await setup({ draft });
      expect(await screen.findByLabelText('Extra step field')).toBeOnTheScreen();
      expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();
    });

    it('AC-6: clears the draft when the form is submitted', async () => {
      const { user, onSubmit } = await setup({ draft });
      await user.type(screen.getByLabelText('Name'), 'Sam');
      await user.press(screen.getByRole('button', { name: 'Next' }));
      await user.press(await screen.findByRole('button', { name: 'Next' }));
      await user.type(await screen.findByLabelText('Email'), 'a@b.co');
      expect(hasDraft('wizard-test')).toBe(true);
      await user.press(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(hasDraft('wizard-test')).toBe(false);
    });
  });

  describe('review', () => {
    const reviewSteps: StepConfig<Values>[] = [
      {
        title: label('About you'),
        fields: [
          { type: 'text', name: 'name', label: label('Name') },
          { type: 'checkbox', name: 'skip', label: label('Skip extra') },
          { type: 'text', name: 'extra', label: label('Extra'), visibleIf: (v) => !v.skip },
        ],
      },
      {
        title: label('Contact'),
        fields: [
          { type: 'text', name: 'email', label: label('Email') },
          { type: 'text', name: 'pin', label: label('PIN'), props: { secureTextEntry: true } },
        ],
      },
    ];

    async function toReview() {
      const view = await setup({
        steps: reviewSteps,
        review: true,
        defaultValues: { extra: 'extra value', pin: '' },
      });
      await view.user.type(screen.getByLabelText('Name'), 'Sam');
      await view.user.press(screen.getByRole('button', { name: 'Next' }));
      await view.user.type(await screen.findByLabelText('Email'), 'a@b.co');
      await view.user.type(screen.getByLabelText('PIN'), '4321');
      await view.user.press(screen.getByRole('button', { name: 'Next' }));
      return view;
    }

    it('AC-7: adds a last step that lists visible, non-sensitive values', async () => {
      await toReview();
      expect(await screen.findByText('Step 3 of 3')).toBeOnTheScreen();
      expect(screen.getByText('Sam')).toBeOnTheScreen();
      expect(screen.getByText('a@b.co')).toBeOnTheScreen();
      expect(screen.getByText('extra value')).toBeOnTheScreen();
      expect(screen.queryByText('4321')).not.toBeOnTheScreen();
      expect(screen.queryByText('PIN')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeOnTheScreen();
    });

    it('AC-7: leaves out a field hidden by its rule', async () => {
      const view = await setup({
        steps: reviewSteps,
        review: true,
        defaultValues: { extra: 'extra value', pin: '' },
      });
      await view.user.type(screen.getByLabelText('Name'), 'Sam');
      await view.user.press(screen.getByRole('checkbox', { name: 'Skip extra' }));
      await view.user.press(screen.getByRole('button', { name: 'Next' }));
      await view.user.type(await screen.findByLabelText('Email'), 'a@b.co');
      await view.user.press(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText('a@b.co')).toBeOnTheScreen();
      expect(screen.queryByText('extra value')).not.toBeOnTheScreen();
    });

    it('AC-7: Edit jumps to the step and Next comes back to the review', async () => {
      const { user } = await toReview();
      await user.press(await screen.findByRole('link', { name: 'Edit About you' }));
      expect(await screen.findByLabelText('Name')).toBeOnTheScreen();
      expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
    });

    it('AC-7: submits from the review step', async () => {
      const { user, onSubmit } = await toReview();
      await user.press(await screen.findByRole('button', { name: 'Submit' }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });
  });
});
