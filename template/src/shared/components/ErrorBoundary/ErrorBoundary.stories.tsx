import type { Meta, StoryObj } from '@storybook/react-native';

import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('Story render failure');
}

const meta = {
  title: 'Feedback/ErrorBoundary',
  component: ErrorBoundary,
  render: (args) => (
    <ErrorBoundary {...args}>
      <Bomb />
    </ErrorBoundary>
  ),
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A child throws while rendering, so the fallback shows. */
export const Fallback: Story = {};
