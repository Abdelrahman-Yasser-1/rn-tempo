import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { ApiError } from '@services/http/errors';

import { ErrorState } from './ErrorState';

const meta = {
  title: 'Feedback/ErrorState',
  component: ErrorState,
  args: {
    error: new ApiError({ code: 'SERVER', message: 'Boom', status: 500 }),
    onRetry: action('onRetry'),
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Server: Story = {};

export const Network: Story = {
  args: { error: new ApiError({ code: 'NETWORK', message: 'offline' }) },
};

export const NotFound: Story = {
  args: { error: new ApiError({ code: 'NOT_FOUND', message: 'missing', status: 404 }) },
};

export const Unknown: Story = { args: { error: new Error('anything') } };

export const WithoutRetry: Story = { args: { onRetry: undefined } };
