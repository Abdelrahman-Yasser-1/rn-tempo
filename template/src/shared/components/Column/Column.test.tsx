import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Column } from './Column';

describe('Column', () => {
  it('lays children out with flexDirection column', async () => {
    await renderWithProviders(
      <Column
        testID="column"
        accessibilityLabel="Stack"
        accessible
        align="center"
        justify="between"
        gap="sm"
      >
        <Text>One</Text>
        <Text>Two</Text>
      </Column>,
    );
    const stack = screen.getByLabelText('Stack');
    expect(stack).toHaveStyle({
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    });
    expect(stack).toHaveProp('testID', 'column');
    expect(screen.getByText('Two')).toBeOnTheScreen();
  });
});
