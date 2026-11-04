import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FieldLabel } from './FieldLabel';

describe('FieldLabel', () => {
  it('renders the label', async () => {
    await renderWithProviders(<FieldLabel label="Email" />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
  });

  it('marks a required field with an asterisk announced as required', async () => {
    await renderWithProviders(<FieldLabel label="Email" required />);
    expect(screen.getByLabelText('required')).toHaveTextContent('*');
  });

  it('shows no required marker by default', async () => {
    await renderWithProviders(<FieldLabel label="Email" />);
    expect(screen.queryByLabelText('required')).not.toBeOnTheScreen();
  });

  it('shows the sub label next to the label', async () => {
    await renderWithProviders(<FieldLabel label="Phone" subLabel="(optional)" />);
    expect(screen.getByText('(optional)')).toBeOnTheScreen();
  });

  it('has no tooltip button without a tooltip', async () => {
    await renderWithProviders(<FieldLabel label="Email" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('toggles the hint from the tooltip button', async () => {
    const { user } = await renderWithProviders(
      <FieldLabel label="Email" tooltip="Use your work email" />,
    );
    expect(screen.queryByText('Use your work email')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Show hint' }));
    expect(screen.getByText('Use your work email')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hide hint' })).toBeExpanded();

    await user.press(screen.getByRole('button', { name: 'Hide hint' }));
    expect(screen.queryByText('Use your work email')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeCollapsed();
  });
});
