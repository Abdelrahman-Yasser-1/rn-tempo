import type { Meta, StoryObj } from '@storybook/react-native';

import { Box } from '../Box';

import type { WebViewProps } from './types';
import { WebView } from './WebView';

function Demo(props: WebViewProps) {
  return (
    <Box flex={1}>
      <WebView {...props} />
    </Box>
  );
}

const meta = {
  title: 'Feedback/WebView',
  component: Demo,
  args: { url: 'https://dummyjson.com/docs' },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ExtraHost: Story = {
  args: { url: 'https://dummyjson.com/docs', allowedHosts: ['dummyjson.com', 'github.com'] },
};
