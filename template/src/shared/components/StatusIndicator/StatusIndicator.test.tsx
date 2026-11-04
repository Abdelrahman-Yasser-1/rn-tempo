import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkTheme, lightTheme } from '@theme/themes';

import { StatusIndicator } from './StatusIndicator';

const STATUSES = ['success', 'warning', 'error', 'info', 'neutral'] as const;

describe('StatusIndicator', () => {
  it('renders the label as its accessible name', async () => {
    await renderWithProviders(<StatusIndicator status="success" label="Active" />);
    expect(screen.getByLabelText('Active')).toBeOnTheScreen();
    expect(screen.getByText('Active')).toBeOnTheScreen();
  });

  it.each(STATUSES)('renders the %s status in both sizes', async (status) => {
    await renderWithProviders(
      <>
        <StatusIndicator status={status} label="Small" size="sm" />
        <StatusIndicator status={status} label="Medium" size="md" />
      </>,
    );
    expect(screen.getByText('Small')).toBeOnTheScreen();
    expect(screen.getByText('Medium')).toBeOnTheScreen();
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('keeps every dot at 3:1 on the page in the %s theme', (_name, theme) => {
    const { colors } = theme;
    const dots = [colors.success, colors.warning, colors.error, colors.info, colors.textSecondary];
    for (const dot of dots) {
      expect(contrast(dot, colors.background)).toBeGreaterThanOrEqual(3);
    }
  });
});
