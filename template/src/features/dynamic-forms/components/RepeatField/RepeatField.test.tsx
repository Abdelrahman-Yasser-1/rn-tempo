import { screen, waitFor } from '@testing-library/react-native';
import { z } from 'zod';

import { FormBuilder } from '@features/dynamic-forms/components/FormBuilder';
import type { FormField } from '@features/dynamic-forms/types';
import { VALIDATION_MESSAGES } from '@features/dynamic-forms/utils/messages';
import { Button } from '@shared/components';
import { renderWithProviders } from '@test-utils/renderWithProviders';

type Values = { show: boolean; people: { name: string }[] };

const schema = z.object({
  show: z.boolean(),
  people: z
    .array(z.object({ name: z.string().min(1, VALIDATION_MESSAGES.required) }))
    .min(1, VALIDATION_MESSAGES.tooFewItems),
});

const label = (en: string) => ({ en, ar: en });

function fields(minItems: number): FormField<Values>[] {
  return [
    { type: 'checkbox', name: 'show', label: label('Show people'), defaultValue: true },
    {
      type: 'repeat',
      name: 'people',
      minItems,
      maxItems: 3,
      itemLabel: label('Person'),
      addLabel: label('Add person'),
      visibleIf: (values) => values.show,
      fields: [{ type: 'text', name: 'name', label: label('Name') }],
    },
  ];
}

async function setup(minItems: number, defaultValues?: Partial<Values>) {
  const onSubmit = jest.fn<undefined, [Values]>();
  const view = await renderWithProviders(
    <FormBuilder<Values>
      fields={fields(minItems)}
      schema={schema}
      onSubmit={onSubmit}
      defaultValues={defaultValues}
      renderSubmitButton={(onPress) => <Button title="Send" onPress={onPress} />}
    />,
  );
  return { ...view, onSubmit };
}

describe('RepeatField', () => {
  it('AC-5: starts with minItems items and cannot remove below it', async () => {
    await setup(2);
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove Person 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Person 2' })).toBeDisabled();
  });

  it('AC-5: adds up to maxItems and removes down to minItems', async () => {
    const { user } = await setup(1);
    const add = () => screen.getByRole('button', { name: 'Add person' });
    await user.press(add());
    await user.press(add());
    expect(screen.getAllByLabelText('Name')).toHaveLength(3);
    expect(add()).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Remove Person 2' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
    expect(add()).toBeEnabled();
  });

  it('AC-5: validates each item and shows the error on the item that holds it', async () => {
    const { user, onSubmit } = await setup(2);
    const [first] = screen.getAllByLabelText('Name');
    if (!first) {
      throw new Error('The first item has no Name field');
    }
    await user.type(first, 'Sam');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findAllByText('This field is required.')).toHaveLength(1);
    expect(onSubmit).not.toHaveBeenCalled();

    const second = screen.getAllByLabelText('Name')[1];
    if (!second) {
      throw new Error('The second item has no Name field');
    }
    await user.type(second, 'Alex');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      show: true,
      people: [{ name: 'Sam' }, { name: 'Alex' }],
    });
  });

  it('AC-5: shows the list error when the list is shorter than the schema allows', async () => {
    const { user } = await setup(0, { people: [{ name: 'Sam' }] });
    await user.press(screen.getByRole('button', { name: 'Remove Person 1' }));
    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Add more items.')).toBeOnTheScreen();
  });

  it('AC-2: a hidden list is not rendered or validated', async () => {
    const { user, onSubmit } = await setup(1);
    await user.press(screen.getByRole('checkbox', { name: 'Show people' }));
    expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
