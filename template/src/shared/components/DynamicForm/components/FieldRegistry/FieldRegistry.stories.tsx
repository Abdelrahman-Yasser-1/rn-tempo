import type { Meta, StoryObj } from '@storybook/react-native';
import { FormProvider, useForm } from 'react-hook-form';

import { Column } from '@shared/components/Column';

import { fieldRenderers } from './FieldRegistry';
import type { FieldRenderArgs } from './types';

const resolve = (text: unknown) => (typeof text === 'string' ? text : undefined);
const options = [
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
];

function args<K extends keyof typeof fieldRenderers>(
  name: string,
  config: FieldRenderArgs<K>['config'],
): FieldRenderArgs<K> {
  return {
    name,
    config,
    texts: { label: name },
    isRequired: false,
    isDisabled: false,
    testID: `registry.${name}`,
    resolve,
  };
}

function Gallery() {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <Column gap="md">
        {fieldRenderers.text(args<'text'>('text', {}))}
        {fieldRenderers.number(args<'number'>('number', {}))}
        {fieldRenderers.select(args<'select'>('select', { options }))}
        {fieldRenderers.radioGroup(args<'radioGroup'>('radioGroup', { options }))}
        {fieldRenderers.checkbox(args<'checkbox'>('checkbox', {}))}
        {fieldRenderers.switch(args<'switch'>('switch', {}))}
      </Column>
    </FormProvider>
  );
}

const meta = {
  title: 'DynamicForm/FieldRegistry',
  component: Gallery,
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
