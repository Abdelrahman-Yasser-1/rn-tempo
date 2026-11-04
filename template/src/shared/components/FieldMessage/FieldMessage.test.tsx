import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FieldMessage } from './FieldMessage';

describe('FieldMessage', () => {
  it('announces an error as an alert', async () => {
    await renderWithProviders(<FieldMessage variant="error" message="Required" />);
    expect(screen.getByRole('alert', { name: 'Required' })).toBeOnTheScreen();
  });

  it('announces an error politely', async () => {
    await renderWithProviders(<FieldMessage variant="error" message="Required" />);
    expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('shows a helper as plain text without an alert role', async () => {
    await renderWithProviders(<FieldMessage message="We never share it" />);
    expect(screen.getByText('We never share it')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByText('We never share it')).not.toHaveProp(
      'accessibilityLiveRegion',
      'polite',
    );
  });
});
