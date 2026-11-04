import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { action } from 'storybook/actions';

import { Pagination } from './Pagination';
import type { PaginationProps } from './types';

function Stateful(args: PaginationProps) {
  const [page, setPage] = useState(args.page);
  return <Pagination {...args} page={page} onChange={setPage} />;
}

const meta = {
  title: 'Navigation/Pagination',
  component: Pagination,
  args: { page: 5, pageCount: 20, onChange: action('onChange') },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const FewPages: Story = { args: { page: 1, pageCount: 4 } };
