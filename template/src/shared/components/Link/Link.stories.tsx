import type { Meta, StoryObj } from '@storybook/react-native';
import { action } from 'storybook/actions';

import { Column } from '@shared/components/Column';
import { Text } from '@shared/components/Text';

import { Link } from './Link';

const meta = {
  title: 'Display/Link',
  component: Link,
  args: { children: 'See all', variant: 'underline', onPress: action('onPress') },
  argTypes: { variant: { control: 'select', options: ['underline', 'plain'] } },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Plain: Story = { args: { variant: 'plain' } };

export const WithHref: Story = { args: { href: 'https://example.com', children: 'Open site' } };

export const Inline: Story = {
  render: (args) => (
    <Column gap="md">
      <Text>
        By continuing you accept the{' '}
        <Link {...args} inline>
          terms of use
        </Link>{' '}
        and the privacy policy.
      </Text>
      <Link {...args} disabled>
        Disabled link
      </Link>
    </Column>
  ),
};
