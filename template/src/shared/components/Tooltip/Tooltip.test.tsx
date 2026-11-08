import { screen } from '@testing-library/react-native';

import { Icon } from '@shared/components/Icon';
import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkColors, lightColors } from '@theme/tokens';

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

  it('announces the bubble through a polite live region', async () => {
    await renderWithProviders(
      <Tooltip content="Ten digits" visible accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    expect(screen.getByText('Ten digits')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('closes by a second press on the trigger and reports each change', async () => {
    const onVisibleChange = jest.fn();
    const { user } = await renderWithProviders(
      <Tooltip content="Ten digits" accessibilityLabel="Help" onVisibleChange={onVisibleChange}>
        <Icon name="info" />
      </Tooltip>,
    );
    await user.press(screen.getByRole('button', { name: 'Help' }));
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
    // The open bubble sits in a modal that covers the trigger, so the backdrop closes it.
    await user.press(screen.getByRole('button', { name: 'Close tooltip' }));
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Help' })).toBeCollapsed();
  });

  it('asks to open, but does not open itself, when controlled and hidden', async () => {
    const onVisibleChange = jest.fn();
    const { user } = await renderWithProviders(
      <Tooltip
        content="Ten digits"
        visible={false}
        onVisibleChange={onVisibleChange}
        accessibilityLabel="Help"
      >
        <Icon name="info" />
      </Tooltip>,
    );
    await user.press(screen.getByRole('button', { name: 'Help' }));
    expect(onVisibleChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Ten digits')).not.toBeOnTheScreen();
  });

  it('shows and hides when the controlled visible prop changes', async () => {
    const { rerender } = await renderWithProviders(
      <Tooltip content="Ten digits" visible={false} accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    expect(screen.queryByText('Ten digits')).not.toBeOnTheScreen();
    await rerender(
      <Tooltip content="Ten digits" visible accessibilityLabel="Help">
        <Icon name="info" />
      </Tooltip>,
    );
    expect(screen.getByText('Ten digits')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Help' })).toBeExpanded();
  });

  it('passes the testID to the trigger and its parts', async () => {
    await renderWithProviders(
      <Tooltip content="Ten digits" visible accessibilityLabel="Help" testID="tip">
        <Icon name="info" />
      </Tooltip>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('tip.bubble')).toHaveTextContent('Ten digits');
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('tip.backdrop')).toBeOnTheScreen();
  });
});
