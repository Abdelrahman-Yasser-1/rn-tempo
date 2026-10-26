import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Row } from './Row';

describe('Row', () => {
  it('lays children out with flexDirection row', async () => {
    await renderWithProviders(
      <Row
        testID="row"
        accessibilityLabel="Stack"
        accessible
        align="center"
        justify="between"
        gap="sm"
      >
        <Text>One</Text>
        <Text>Two</Text>
      </Row>,
    );
    const stack = screen.getByLabelText('Stack');
    expect(stack).toHaveStyle({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    });
    expect(stack).toHaveProp('testID', 'row');
    expect(screen.getByText('Two')).toBeOnTheScreen();
  });
});
