import type { Meta, StoryObj } from '@storybook/react-native';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';

import { ICONS } from '@assets/generated/icons.registry';
import type { IconName } from '@assets/generated/icons.types';

import { Box } from '../Box';
import { Text } from '../Text';
import { TextField } from '../TextField';

import { Icon } from './Icon';

const COLUMNS = 4;
const ICON_NAMES = (Object.keys(ICONS) as IconName[]).sort((a, b) => a.localeCompare(b));

function IconGallery() {
  const [term, setTerm] = useState('');
  const names = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return needle ? ICON_NAMES.filter((name) => name.includes(needle)) : ICON_NAMES;
  }, [term]);

  return (
    <Box flex={1} p="md" gap="md">
      <TextField
        label="Search icons"
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        helperText={`${String(names.length)} of ${String(ICON_NAMES.length)} icons. Use the name: <Icon name="home" />`}
      />
      <FlatList
        data={names}
        keyExtractor={(name) => name}
        numColumns={COLUMNS}
        initialNumToRender={40}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Box flex={1} align="center" gap="xs" py="sm">
            <Icon name={item} />
            <Text variant="caption" color="textSecondary" align="center" numberOfLines={2}>
              {item}
            </Text>
          </Box>
        )}
      />
    </Box>
  );
}

const meta = {
  title: 'Icon/Gallery',
  component: IconGallery,
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every icon in src/assets/icons, filtered by name. Development only (Storybook). */
export const Gallery: Story = {};
