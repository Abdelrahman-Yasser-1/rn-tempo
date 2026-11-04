import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import type { PickedFile } from '@services/files/types';

import { FilePicker } from './FilePicker';

function Demo(
  args: Readonly<{ label?: string; errorText?: string; maxSizeMB?: number; accept?: string[] }>,
) {
  const [file, setFile] = useState<PickedFile | null>(null);

  return <FilePicker {...args} value={file} onChange={setFile} />;
}

const meta = {
  title: 'Inputs/FilePicker',
  component: Demo,
  args: { label: 'Attachment', maxSizeMB: 5 },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const PdfOnly: Story = { args: { accept: ['application/pdf'], label: 'Contract (PDF)' } };

export const WithError: Story = { args: { errorText: 'Attach a file.' } };
