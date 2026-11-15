import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Text } from 'react-native';

import type { FormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { FormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FieldRenderer } from './FieldRenderer';

type Values = { first: string; second: string; extra: string; show: boolean };

const context = {
  resets: new Map<string, unknown>(),
  asyncErrors: new Map<string, string>(),
  spacing: 'md',
} as const;
const values: Values = { first: '', second: '', extra: '', show: false };

function Harness({ children }: Readonly<{ children: ReactNode }>) {
  const form = useForm<Values>({ defaultValues: values });
  return (
    <FormProvider {...form}>
      <FormBuilderContext value={context}>{children}</FormBuilderContext>
    </FormProvider>
  );
}

const label = (en: string) => ({ en, ar: en });

function renderField(field: FormField<Values>) {
  return renderWithProviders(
    <Harness>
      <FieldRenderer field={field} values={values} />
    </Harness>,
  );
}

describe('FieldRenderer', () => {
  it('renders a bound field', async () => {
    await renderField({ type: 'text', name: 'first', label: label('First') });

    expect(screen.getByLabelText('First')).toBeOnTheScreen();
  });

  it('renders the children of a row and of a group', async () => {
    await renderField({
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { type: 'text', name: 'first', label: label('First') },
            { type: 'text', name: 'second', label: label('Second') },
          ],
        },
        { type: 'text', name: 'extra', label: label('Extra') },
      ],
    });

    expect(screen.getByLabelText('First')).toBeOnTheScreen();
    expect(screen.getByLabelText('Second')).toBeOnTheScreen();
    expect(screen.getByLabelText('Extra')).toBeOnTheScreen();
  });

  it('renders a custom node and hides it when its rule fails', async () => {
    await renderField({
      type: 'group',
      fields: [
        { type: 'custom', render: () => <Text>Shown note</Text> },
        { type: 'custom', render: () => <Text>Hidden note</Text>, visibleIf: (v) => v.show },
      ],
    });

    expect(screen.getByText('Shown note')).toBeOnTheScreen();
    expect(screen.queryByText('Hidden note')).not.toBeOnTheScreen();
  });

  it('hides the children of a hidden group', async () => {
    await renderField({
      type: 'group',
      visibleIf: (current) => current.show,
      fields: [{ type: 'text', name: 'first', label: label('First') }],
    });

    expect(screen.queryByLabelText('First')).not.toBeOnTheScreen();
  });
});
