import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { action } from 'storybook/actions';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import type { StepConfig } from '@shared/components/DynamicForm/components/FieldRegistry';
import { Text } from '@shared/components/Text';

import { MultiStepFormBuilder } from './MultiStepFormBuilder';

type Values = { name: string; email: string };

const label = (en: string) => ({ en, ar: en });

const steps: StepConfig<Values>[] = [
  {
    id: 'name',
    title: label('Your name'),
    fields: [{ type: 'text', name: 'name', label: label('Name'), required: true }],
  },
  {
    id: 'email',
    title: label('Your email'),
    fields: [{ type: 'text', name: 'email', label: label('Email'), required: true }],
  },
];

const schema = z.object({
  name: z.string().min(1, 'Enter your name'),
  email: z.string().min(1, 'Enter your email'),
}) satisfies z.ZodType<Values, Record<string, unknown>>;

function Demo() {
  return (
    <MultiStepFormBuilder<Values>
      steps={steps}
      schema={schema}
      review
      onSubmit={action('onSubmit')}
      renderStepIndicator={(index, total, title) => (
        <Text variant="title">{`${String(index + 1)}/${String(total)} ${title ?? ''}`}</Text>
      )}
      renderNavigation={(navigation) => (
        <View>
          <Button title="Back" onPress={navigation.onBack} disabled={navigation.isFirstStep} />
          <Button
            title={navigation.isLastStep ? 'Submit' : 'Next'}
            onPress={navigation.isLastStep ? navigation.onSubmit : navigation.onNext}
          />
        </View>
      )}
    />
  );
}

const meta = {
  title: 'DynamicForm/MultiStepFormBuilder',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
