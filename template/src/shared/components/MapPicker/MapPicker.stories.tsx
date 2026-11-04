import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { MapPicker } from './MapPicker';
import type { MapLocation, MapPickerProps } from './types';

function Demo(args: Omit<MapPickerProps, 'value' | 'onChange'>) {
  const [location, setLocation] = useState<MapLocation | null>(null);

  return <MapPicker {...args} value={location} onChange={setLocation} />;
}

const meta = {
  title: 'Inputs/MapPicker',
  component: Demo,
  args: { label: 'Pickup location' },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithoutMyLocation: Story = { args: { showMyLocation: false } };

export const WithError: Story = { args: { errorText: 'Choose a location.' } };
