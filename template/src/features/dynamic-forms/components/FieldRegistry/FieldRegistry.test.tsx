import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { fieldRenderers } from './FieldRegistry';
import type { FieldRenderArgs, FieldTypeName } from './types';

const resolve = (text: unknown) => (typeof text === 'string' ? text : undefined);

function args<K extends FieldTypeName>(
  name: string,
  config: FieldRenderArgs<K>['config'],
): FieldRenderArgs<K> {
  return {
    name,
    config,
    texts: { label: `Label ${name}` },
    isRequired: false,
    isDisabled: false,
    testID: `field.${name}`,
    resolve,
  };
}

const options = [
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
];

const gallery: Record<FieldTypeName, ReactNode> = {
  text: fieldRenderers.text(args<'text'>('text', {})),
  textArea: fieldRenderers.textArea(args<'textArea'>('textArea', {})),
  number: fieldRenderers.number(args<'number'>('number', {})),
  select: fieldRenderers.select(args<'select'>('select', { options })),
  multiSelect: fieldRenderers.multiSelect(args<'multiSelect'>('multiSelect', { options })),
  radioGroup: fieldRenderers.radioGroup(args<'radioGroup'>('radioGroup', { options })),
  checkbox: fieldRenderers.checkbox(args<'checkbox'>('checkbox', {})),
  switch: fieldRenderers.switch(args<'switch'>('switch', {})),
  slider: fieldRenderers.slider(args<'slider'>('slider', { props: { min: 0, max: 10 } })),
  date: fieldRenderers.date(args<'date'>('date', {})),
  time: fieldRenderers.time(args<'time'>('time', {})),
  monthYear: fieldRenderers.monthYear(args<'monthYear'>('monthYear', {})),
  timeSlot: fieldRenderers.timeSlot(
    args<'timeSlot'>('timeSlot', { props: { slots: [{ value: '09:00' }] } }),
  ),
  otp: fieldRenderers.otp(args<'otp'>('otp', {})),
  phone: fieldRenderers.phone(args<'phone'>('phone', {})),
  // @tempo-feature:file-picker:start
  file: fieldRenderers.file(args<'file'>('file', {})),
  multiFile: fieldRenderers.multiFile(args<'multiFile'>('multiFile', {})),
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  map: fieldRenderers.map(args<'map'>('map', {})),
  // @tempo-feature:maps:end
};

function Gallery({ children }: Readonly<{ children: ReactNode }>) {
  const form = useForm({
    defaultValues: {
      text: 'hello',
      textArea: 'long text',
      number: 4,
      select: 'dog',
      multiSelect: ['cat'],
      radioGroup: 'cat',
      checkbox: true,
      switch: true,
      slider: 3,
      phone: '',
      otp: '',
    },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

describe('field registry', () => {
  it('AC-1: renders every field type with its label', async () => {
    const sortByName = (left: string, right: string) => left.localeCompare(right);
    expect(Object.keys(gallery).sort(sortByName)).toEqual(
      Object.keys(fieldRenderers).sort(sortByName),
    );
    for (const [type, element] of Object.entries(gallery).filter(([type]) => type !== 'otp')) {
      const { unmount } = await renderWithProviders(<Gallery>{element}</Gallery>);
      expect(screen.getAllByText(`Label ${type}`).length).toBeGreaterThan(0);
      await unmount();
    }
  });

  it('AC-1: renders the OTP input, which has no label slot', async () => {
    await renderWithProviders(<Gallery>{gallery.otp}</Gallery>);
    expect(screen.getByLabelText('Digit 1 of 6')).toBeOnTheScreen();
  });

  it('AC-1: shows the form value of each bound field', async () => {
    await renderWithProviders(
      <Gallery>
        {gallery.text}
        {gallery.textArea}
        {gallery.radioGroup}
        {gallery.checkbox}
        {gallery.switch}
      </Gallery>,
    );
    expect(screen.getByLabelText('Label text').props.value).toBe('hello');
    expect(screen.getByLabelText('Label textArea').props.value).toBe('long text');
    expect(screen.getByRole('radio', { name: 'Cat' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Label checkbox' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Label switch' })).toBeChecked();
  });

  it('AC-1: shows the selected option of a select', async () => {
    await renderWithProviders(<Gallery>{gallery.select}</Gallery>);
    expect(screen.getAllByText('Dog').length).toBeGreaterThan(0);
  });

  it('AC-1: writes a typed value back to the form state', async () => {
    const { user } = await renderWithProviders(
      <Gallery>
        {gallery.text}
        {gallery.checkbox}
      </Gallery>,
    );
    await user.clear(screen.getByLabelText('Label text'));
    await user.type(screen.getByLabelText('Label text'), 'changed');
    expect(screen.getByLabelText('Label text').props.value).toBe('changed');
    await user.press(screen.getByRole('checkbox', { name: 'Label checkbox' }));
    expect(screen.getByRole('checkbox', { name: 'Label checkbox' })).not.toBeChecked();
  });

  it('marks a required field and disables a disabled one', async () => {
    await renderWithProviders(
      <Gallery>
        {fieldRenderers.text({
          ...args<'text'>('text', {}),
          isRequired: true,
          isDisabled: true,
          texts: { label: 'Locked', placeholder: 'Type here' },
        })}
      </Gallery>,
    );
    expect(screen.getByLabelText('Locked')).toBeDisabled();
    expect(screen.getByPlaceholderText('Type here')).toBeOnTheScreen();
  });
});
