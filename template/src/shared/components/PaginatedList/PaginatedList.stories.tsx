import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ListItem } from '@shared/components/ListItem';

import { PaginatedList } from './PaginatedList';
import type { PaginatedQuery } from './types';

type Page = Readonly<{ rows: readonly string[] }>;

const query = {
  data: {
    pages: [{ rows: ['Alpha', 'Beta', 'Gamma', 'Delta'] }],
    pageParams: [0],
  },
  error: null,
  isPending: false,
  isError: false,
  isRefetching: false,
  isPlaceholderData: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: () => Promise.resolve(),
  refetch: () => Promise.resolve(),
} as unknown as PaginatedQuery<Page>;

const styles = StyleSheet.create({ container: { height: 320 } });

const meta = {
  title: 'Lists/PaginatedList',
  component: PaginatedList<string, Page>,
  args: {
    query,
    getItems: (page: Page) => page.rows,
    renderItem: ({ item }: { item: string }) => <ListItem title={item} showDivider />,
    keyExtractor: (item: string) => item,
  },
  render: (args) => (
    <View style={styles.container}>
      <PaginatedList {...args} />
    </View>
  ),
} satisfies Meta<typeof PaginatedList<string, Page>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Empty: Story = {
  args: { query: { ...query, data: { pages: [{ rows: [] }], pageParams: [0] } } },
};
