import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { FileRow } from './FileRow';

const meta = {
  title: 'Inputs/FileRow',
  component: FileRow,
  args: {
    file: {
      uri: 'file:///report.pdf',
      name: 'Quarterly report.pdf',
      type: 'application/pdf',
      size: 1_572_864,
    },
    onRemove: action('onRemove'),
  },
} satisfies Meta<typeof FileRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Document: Story = {};

export const Photo: Story = {
  args: { file: { uri: 'file:///p.jpg', name: 'IMG_0042.jpg', type: 'image/jpeg', size: 840_000 } },
};

export const ReadOnly: Story = { args: { onRemove: undefined } };
