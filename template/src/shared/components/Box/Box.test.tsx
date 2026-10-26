import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Box } from './Box';

describe('Box', () => {
  it('renders children and passes testID and accessibility props through', async () => {
    await renderWithProviders(
      <Box testID="box" accessibilityLabel="Panel" accessible>
        <Text>Inside</Text>
      </Box>,
    );
    expect(screen.getByText('Inside')).toBeOnTheScreen();
    expect(screen.getByLabelText('Panel')).toHaveProp('testID', 'box');
  });

  it('maps spacing, background and radius tokens to styles', async () => {
    await renderWithProviders(
      <Box accessibilityLabel="Card" accessible p="lg" px="xl" gap="sm" bg="surface" radius="md" />,
    );
    expect(screen.getByLabelText('Card')).toHaveStyle({
      padding: 16,
      paddingHorizontal: 24,
      gap: 8,
      backgroundColor: '#F8FAFC',
      borderRadius: 8,
    });
  });

  it('uses logical start/end properties instead of left/right', async () => {
    await renderWithProviders(<Box accessibilityLabel="Logical" accessible ps="md" me="xs" />);
    const box = screen.getByLabelText('Logical');
    expect(box).toHaveStyle({ paddingStart: 12, marginEnd: 4 });
    expect(box).not.toHaveStyle({ paddingLeft: 12 });
  });

  it('maps align and justify names to flexbox values', async () => {
    await renderWithProviders(
      <Box
        accessibilityLabel="Flex"
        accessible
        direction="row"
        align="end"
        justify="between"
        wrap
      />,
    );
    expect(screen.getByLabelText('Flex')).toHaveStyle({
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    });
  });
});
