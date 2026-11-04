import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Button } from '../Button';
import { Column } from '../Column';
import { Text } from '../Text';

import { FileSourceSheet } from './FileSourceSheet';

function Demo() {
  const [isVisible, setIsVisible] = useState(false);
  const [source, setSource] = useState<string>();

  return (
    <Column gap="md">
      <Button
        title="Open source sheet"
        onPress={() => {
          setIsVisible(true);
        }}
      />
      <Text>{source ?? 'Nothing chosen'}</Text>
      <FileSourceSheet
        visible={isVisible}
        sources={['camera', 'library', 'files']}
        onSelect={(next) => {
          setSource(next);
          setIsVisible(false);
        }}
        onClose={() => {
          setIsVisible(false);
        }}
      />
    </Column>
  );
}

const meta = {
  title: 'Inputs/FileSourceSheet',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
