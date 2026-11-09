import { act, screen, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import { z } from 'zod';

import { useAuthStore } from '@features/auth';
import type { FormChangeEvent, FormField } from '@features/dynamic-forms/types';
import { discardDraft, hasDraft, loadDraft } from '@features/dynamic-forms/utils/draft';
import { VALIDATION_MESSAGES } from '@features/dynamic-forms/utils/messages';
import { Button, Text } from '@shared/components';
import { createUser } from '@test-utils/factories/user';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormBuilder } from './FormBuilder';
import type { FormBuilderRef } from './types';

type Values = {
  hasPet?: boolean;
  petName?: string;
  species?: string;
  qty?: string;
  price?: string;
  total?: string;
  code?: string;
  username?: string;
};

const optionalText = z.string().optional();
const schema = z.object({
  hasPet: z.boolean().optional(),
  petName: z.string().min(1, VALIDATION_MESSAGES.required).optional(),
  species: optionalText,
  qty: optionalText,
  price: optionalText,
  total: optionalText,
  code: optionalText,
  username: optionalText,
}) satisfies z.ZodType<Values, Record<string, unknown>>;

const label = (en: string) => ({ en, ar: en });

function renderSubmit(onPress: () => void) {
  return <Button title="Send" onPress={onPress} />;
}

const baseFields: FormField<Values>[] = [
  { type: 'checkbox', name: 'hasPet', label: label('Has a pet') },
  {
    type: 'text',
    name: 'petName',
    label: label('Pet name'),
    visibleIf: (values) => values.hasPet === true,
    clearOnHidden: true,
  },
];

describe('FormBuilder', () => {
  it('AC-2: shows a field by its rule and does not validate it while hidden', async () => {
    const onSubmit = jest.fn();
    const { user } = await renderWithProviders(
      <FormBuilder<Values>
        fields={baseFields}
        schema={schema}
        onSubmit={onSubmit}
        renderSubmitButton={renderSubmit}
      />,
    );
    expect(screen.queryByLabelText('Pet name')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    await user.press(screen.getByRole('checkbox', { name: 'Has a pet' }));
    expect(screen.getByLabelText('Pet name')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This field is required.')).toBeOnTheScreen();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('AC-2: clearOnHidden resets the field when it is hidden', async () => {
    const ref = createRef<FormBuilderRef<Values>>();
    const { user } = await renderWithProviders(
      <FormBuilder<Values> ref={ref} fields={baseFields} schema={schema} onSubmit={jest.fn()} />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Has a pet' }));
    await user.type(screen.getByLabelText('Pet name'), 'Rex');
    expect(ref.current?.getValues('petName')).toBe('Rex');

    await user.press(screen.getByRole('checkbox', { name: 'Has a pet' }));
    await waitFor(() => {
      expect(ref.current?.getValues('petName')).toBe('');
    });
  });

  it('AC-2: resetOnChange resets the listed fields', async () => {
    const ref = createRef<FormBuilderRef<Values>>();
    const fields: FormField<Values>[] = [
      {
        type: 'select',
        name: 'species',
        label: label('Species'),
        options: [{ value: 'cat', label: label('Cat') }],
        resetOnChange: ['petName'],
      },
      { type: 'text', name: 'petName', label: label('Pet name'), defaultValue: 'Unnamed' },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> ref={ref} fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    await user.type(screen.getByLabelText('Pet name'), 'Rex');
    expect(ref.current?.getValues('petName')).toBe('UnnamedRex');

    await act(async () => {
      ref.current?.setValue('species', 'cat');
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(ref.current?.getValues('petName')).toBe('Unnamed');
    });
  });

  it('AC-2: calculatedValue derives a read-only field', async () => {
    const fields: FormField<Values>[] = [
      { type: 'text', name: 'qty', label: label('Qty') },
      { type: 'text', name: 'price', label: label('Price') },
      {
        type: 'text',
        name: 'total',
        label: label('Total'),
        calculatedValue: (values) => String(Number(values.qty) * Number(values.price)),
      },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    await user.type(screen.getByLabelText('Qty'), '3');
    await user.type(screen.getByLabelText('Price'), '5');
    await waitFor(() => {
      expect(screen.getByLabelText('Total').props.value).toBe('15');
    });
    expect(screen.getByLabelText('Total')).toBeDisabled();
  });

  it('AC-2: transform rewrites the stored value and disabledIf disables a field', async () => {
    const onChangeText = jest.fn();
    const fields: FormField<Values>[] = [
      {
        type: 'text',
        name: 'code',
        label: label('Code'),
        transform: (value) => String(value).toUpperCase(),
        onValueChange: onChangeText,
      },
      {
        type: 'text',
        name: 'username',
        label: label('Username'),
        disabledIf: (values) => values.code === 'LOCK',
      },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    expect(screen.getByLabelText('Username')).toBeEnabled();
    await user.type(screen.getByLabelText('Code'), 'lock');
    await waitFor(() => {
      expect(screen.getByLabelText('Code').props.value).toBe('LOCK');
    });
    expect(screen.getByLabelText('Username')).toBeDisabled();
    expect(onChangeText).toHaveBeenLastCalledWith(
      'LOCK',
      expect.objectContaining({ code: 'LOCK' }),
    );
  });

  it('AC-3: debounces async validation, shows its error and keeps one call for a burst', async () => {
    const asyncValidate = jest.fn((value: unknown) =>
      Promise.resolve(value === 'taken' ? 'forms:validation.invalid' : undefined),
    );
    const fields: FormField<Values>[] = [
      {
        type: 'text',
        name: 'username',
        label: label('Username'),
        asyncValidate,
        asyncValidateDebounceMs: 40,
      },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    await user.type(screen.getByLabelText('Username'), 'taken');
    expect(asyncValidate).not.toHaveBeenCalled();
    expect(await screen.findByText('This value is not valid.')).toBeOnTheScreen();
    expect(asyncValidate).toHaveBeenCalledTimes(1);
    expect(asyncValidate).toHaveBeenCalledWith(
      'taken',
      expect.objectContaining({ username: 'taken' }),
    );
  });

  it('AC-3: ignores the answer of a stale call', async () => {
    const answers: ((message: string | undefined) => void)[] = [];
    const asyncValidate = jest.fn(
      () =>
        new Promise<string | undefined>((resolve) => {
          answers.push(resolve);
        }),
    );
    const fields: FormField<Values>[] = [
      { type: 'text', name: 'username', label: label('Username'), asyncValidate },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    await user.type(screen.getByLabelText('Username'), 'a');
    await user.type(screen.getByLabelText('Username'), 'b');
    expect(asyncValidate).toHaveBeenCalledTimes(2);

    await act(async () => {
      answers[1]?.(undefined);
      answers[0]?.('forms:validation.invalid');
      await Promise.resolve();
    });
    expect(screen.queryByText('This value is not valid.')).not.toBeOnTheScreen();
  });

  it('AC-3: an async error blocks submit until the value changes', async () => {
    const onSubmit = jest.fn();
    const fields: FormField<Values>[] = [
      {
        type: 'text',
        name: 'username',
        label: label('Username'),
        asyncValidate: (value) =>
          Promise.resolve(value === 'taken' ? 'forms:validation.invalid' : undefined),
      },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values>
        fields={fields}
        schema={schema}
        onSubmit={onSubmit}
        renderSubmitButton={renderSubmit}
      />,
    );
    await user.type(screen.getByLabelText('Username'), 'taken');
    await screen.findByText('This value is not valid.');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Username'));
    await user.type(screen.getByLabelText('Username'), 'free');
    await waitFor(() => {
      expect(screen.queryByText('This value is not valid.')).not.toBeOnTheScreen();
    });
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it('renders row, group and custom layouts and hides them with their children', async () => {
    const fields: FormField<Values>[] = [
      { type: 'checkbox', name: 'hasPet', label: label('Show') },
      {
        type: 'group',
        visibleIf: (values) => values.hasPet === true,
        fields: [
          { type: 'custom', render: () => <Text>Custom note</Text> },
          {
            type: 'row',
            flex: [2, 1],
            fields: [
              { type: 'text', name: 'qty', label: label('Qty') },
              { type: 'text', name: 'price', label: label('Price') },
            ],
          },
        ],
      },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values> fields={fields} schema={schema} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByText('Custom note')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Show' }));
    expect(screen.getByText('Custom note')).toBeOnTheScreen();
    expect(screen.getByLabelText('Qty')).toBeOnTheScreen();
    expect(screen.getByLabelText('Price')).toBeOnTheScreen();
  });

  it('AC-9: submit gives typed values, the ref submits, and onChange reports the form state', async () => {
    const onSubmit = jest.fn<undefined, [Values]>();
    const onChange = jest.fn<undefined, [FormChangeEvent<Values>]>();
    const onSubmitInvalid = jest.fn();
    const ref = createRef<FormBuilderRef<Values>>();
    const fields: FormField<Values>[] = [
      { type: 'text', name: 'username', label: label('Username') },
      { type: 'text', name: 'petName', label: label('Pet name') },
    ];
    const { user } = await renderWithProviders(
      <FormBuilder<Values>
        ref={ref}
        fields={fields}
        schema={schema}
        onSubmit={onSubmit}
        onSubmitInvalid={onSubmitInvalid}
        onChange={onChange}
        defaultValues={{ hasPet: true }}
      />,
    );
    await act(async () => {
      ref.current?.submit();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onSubmitInvalid).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText('Pet name'), 'Rex');
    const event = onChange.mock.lastCall?.[0];
    expect(event?.name).toBe('petName');
    expect(event?.value).toBe('Rex');
    expect(event?.formState.isDirty).toBe(true);
    await act(async () => {
      ref.current?.submit();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ hasPet: true, petName: 'Rex', username: '' });
  });

  describe('draft', () => {
    const draftFields: FormField<Values>[] = [
      { type: 'text', name: 'username', label: label('Username') },
      {
        type: 'text',
        name: 'code',
        label: label('Secret code'),
        props: { secureTextEntry: true },
      },
    ];

    beforeEach(() => {
      useAuthStore.setState({ status: 'signedIn', user: createUser({ id: 7 }) });
      discardDraft('form-test');
    });

    afterEach(() => {
      useAuthStore.setState({ status: 'signedOut', user: null });
    });

    function draftForm(onSubmit: (values: Values) => void) {
      return (
        <FormBuilder<Values>
          fields={draftFields}
          schema={schema}
          onSubmit={onSubmit}
          draft={{ key: 'form-test', debounceMs: 10 }}
          renderSubmitButton={renderSubmit}
        />
      );
    }

    it('AC-6: restores the values after a remount but never the sensitive field', async () => {
      const view = await renderWithProviders(draftForm(jest.fn()));
      await view.user.type(screen.getByLabelText('Username'), 'Sam');
      await view.user.type(screen.getByLabelText('Secret code'), 'hunter2');
      await waitFor(() => {
        expect(loadDraft('form-test')?.values).toEqual({ username: 'Sam' });
      });
      await view.unmount();

      await renderWithProviders(draftForm(jest.fn()));
      expect(screen.getByLabelText('Username').props.value).toBe('Sam');
      expect(screen.getByLabelText('Secret code').props.value).toBe('');
    });

    it('AC-6: clears the draft after a successful submit and can discard it', async () => {
      const onSubmit = jest.fn<undefined, [Values]>();
      const { user } = await renderWithProviders(draftForm(onSubmit));
      await user.type(screen.getByLabelText('Username'), 'Sam');
      await waitFor(() => {
        expect(hasDraft('form-test')).toBe(true);
      });
      await user.press(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(hasDraft('form-test')).toBe(false);
    });

    it('AC-6: keeps the draft when onSubmit fails', async () => {
      const { user } = await renderWithProviders(
        draftForm(() => {
          throw new Error('server down');
        }),
      );
      await user.type(screen.getByLabelText('Username'), 'Sam');
      await waitFor(() => {
        expect(hasDraft('form-test')).toBe(true);
      });
      await user.press(screen.getByRole('button', { name: 'Send' }));
      expect(hasDraft('form-test')).toBe(true);
    });

    it('AC-6: a debounced save after sign-out writes nothing', async () => {
      const view = await renderWithProviders(draftForm(jest.fn()));
      await view.user.type(screen.getByLabelText('Username'), 'Sam');
      useAuthStore.setState({ status: 'signedOut', user: null });
      discardDraft('form-test');
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
      await view.unmount();
      expect(hasDraft('form-test')).toBe(false);
    });

    it('AC-6: discardDraft on the ref removes the draft', async () => {
      const ref = createRef<FormBuilderRef<Values>>();
      const { user } = await renderWithProviders(
        <FormBuilder<Values>
          ref={ref}
          fields={draftFields}
          schema={schema}
          onSubmit={jest.fn()}
          draft={{ key: 'form-test', debounceMs: 10 }}
        />,
      );
      await user.type(screen.getByLabelText('Username'), 'Sam');
      await waitFor(() => {
        expect(hasDraft('form-test')).toBe(true);
      });
      await act(() => {
        ref.current?.discardDraft();
      });
      expect(hasDraft('form-test')).toBe(false);
    });
  });
});
