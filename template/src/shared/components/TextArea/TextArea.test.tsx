import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TextArea } from './TextArea';

describe('TextArea', () => {
  it('shows the length against the limit', async () => {
    await renderWithProviders(<TextArea label="Notes" maxLength={10} value="abc" />);
    expect(screen.getByText('3/10')).toBeOnTheScreen();
  });
});
