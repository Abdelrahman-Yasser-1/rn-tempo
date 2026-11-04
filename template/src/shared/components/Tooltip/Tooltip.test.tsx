import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkColors, lightColors } from '@theme/tokens';

import { Icon } from '../Icon';

import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('hides the bubble until the trigger is pressed, then toggles it', async () => {
    const { user } = await renderWithProviders(
      <Tooltip content="Ten digits" accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    expect(screen.queryByText('Ten digits')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Help' })).toBeCollapsed();

    await user.press(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('Ten digits')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Help' })).toBeExpanded();
  });

  it('closes when the backdrop is pressed', async () => {
    const { user } = await renderWithProviders(
      <Tooltip content="Ten digits" accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    await user.press(screen.getByRole('button', { name: 'Help' }));
    await user.press(screen.getByRole('button', { name: 'Close tooltip' }));
    expect(screen.queryByText('Ten digits')).not.toBeOnTheScreen();
  });

  it('follows the controlled visible prop and reports toggles', async () => {
    const onVisibleChange = jest.fn();
    const { user } = await renderWithProviders(
      <Tooltip content="Shown" visible onVisibleChange={onVisibleChange} accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    expect(screen.getByText('Shown')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close tooltip' }));
    expect(onVisibleChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('Shown')).toBeOnTheScreen();
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('keeps bubble text at AA contrast in the %s theme', (_name, colors) => {
    expect(contrast(colors.textInverse, colors.textPrimary)).toBeGreaterThanOrEqual(4.5);
  });
});
