import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FieldMessage } from './FieldMessage';

describe('FieldMessage', () => {
  it('announces an error as an alert', async () => {
    await renderWithProviders(<FieldMessage variant="error" message="Required" />);
    expect(screen.getByRole('alert', { name: 'Required' })).toBeOnTheScreen();
  });
});
