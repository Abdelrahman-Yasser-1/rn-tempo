import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import type { PickedFile } from '@services/files/types';

import { MultiFilePicker } from './MultiFilePicker';

function Demo(
  args: Readonly<{ label?: string; maxFiles?: number; maxSizeMB?: number; errorText?: string }>,
) {
  const [files, setFiles] = useState<PickedFile[]>([]);

  return <MultiFilePicker {...args} value={files} onChange={setFiles} />;
}

const meta = {
  title: 'Inputs/MultiFilePicker',
  component: Demo,
  args: { label: 'Attachments', maxFiles: 3, maxSizeMB: 5 },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Unlimited: Story = { args: { maxFiles: undefined } };

export const WithError: Story = { args: { errorText: 'Attach at least one file.' } };
