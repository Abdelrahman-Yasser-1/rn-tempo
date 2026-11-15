import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import type { BoundFormField } from '@shared/components/DynamicForm/components/FieldRegistry';
import { FormBuilderContext } from '@shared/components/DynamicForm/hooks/useFormBuilderContext';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { BoundField } from './BoundField';

type Values = { name: string; total: number };

const context = {
  resets: new Map<string, unknown>(),
  asyncErrors: new Map<string, string>(),
  spacing: 'md',
} as const;

function Harness({ children }: Readonly<{ children: ReactNode }>) {
  const form = useForm<Values>({ defaultValues: { name: '', total: 3 } });
  return (
    <FormProvider {...form}>
      <FormBuilderContext value={context}>{children}</FormBuilderContext>
    </FormProvider>
  );
}

const values: Values = { name: '', total: 3 };
const nameField: BoundFormField<Values> = {
  type: 'text',
  name: 'name',
  label: { en: 'Name', ar: 'الاسم' },
  required: true,
};

describe('BoundField', () => {
  it('renders the field through the registry with its translated label', async () => {
    await renderWithProviders(
      <Harness>
        <BoundField field={nameField} values={values} isVisible />
      </Harness>,
    );

    expect(screen.getByLabelText(/Name/)).toBeOnTheScreen();
  });

  it('renders nothing while the field is hidden', async () => {
    await renderWithProviders(
      <Harness>
        <BoundField field={nameField} values={values} isVisible={false} />
      </Harness>,
    );

    expect(screen.queryByLabelText(/Name/)).not.toBeOnTheScreen();
  });

  it('disables a field that `disabledIf` turns off', async () => {
    await renderWithProviders(
      <Harness>
        <BoundField
          field={{ ...nameField, disabledIf: (current) => current.total > 0 }}
          values={values}
          isVisible
        />
      </Harness>,
    );

    expect(screen.getByLabelText(/Name/)).toBeDisabled();
  });

  it('makes a calculated field read-only', async () => {
    await renderWithProviders(
      <Harness>
        <BoundField
          field={{
            type: 'number',
            name: 'total',
            label: { en: 'Total', ar: 'الإجمالي' },
            calculatedValue: (current) => current.total * 2,
          }}
          values={values}
          isVisible
        />
      </Harness>,
    );

    expect(screen.getByLabelText(/Total/)).toBeDisabled();
  });
});
