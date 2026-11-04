import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it('renders the label', async () => {
    await renderWithProviders(<FieldLabel label="Email" />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
  });
});
