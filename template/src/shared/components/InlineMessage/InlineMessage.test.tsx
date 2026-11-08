import { screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import { openUrlSafe } from '@services/linking/linking';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { InlineMessage } from './InlineMessage';

jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

// Icons are SVGs with no accessible handle, so each one is swapped for a text naming the icon.
jest.mock('../Icon', () => {
  const { Text } = jest.requireActual<{ Text: ComponentType<{ children: string }> }>(
    'react-native',
  );
  return {
    Icon: ({ name }: Readonly<{ name: string }>) => <Text>{`icon:${name}`}</Text>,
  };
});

const VARIANTS = [
  ['info', 'info'],
  ['success', 'circle-check'],
  ['warning', 'alert-triangle'],
  ['error', 'alert-circle'],
] as const;

describe('InlineMessage', () => {
  it('shows the title and description', async () => {
    await renderWithProviders(
      <InlineMessage title="Saved" description="Your changes are live" variant="success" />,
    );
    expect(screen.getByText('Saved')).toBeOnTheScreen();
    expect(screen.getByText('Your changes are live')).toBeOnTheScreen();
  });

  it.each(['error', 'warning'] as const)('announces a %s as an alert', async (variant) => {
    await renderWithProviders(<InlineMessage title="Heads up" variant={variant} testID="msg" />);
    // The banner holds a link and a button, so it is not an accessibility element itself and
    // its role is only observable by testID.
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('msg')).toHaveProp('accessibilityRole', 'alert');
  });

  it('does not use the alert role for info', async () => {
    await renderWithProviders(<InlineMessage title="FYI" testID="msg" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('msg')).not.toHaveProp('accessibilityRole', 'alert');
  });

  it('runs the action link', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <InlineMessage title="Offline" action={{ label: 'Retry', onPress }} />,
    );
    await user.press(screen.getByRole('link', { name: 'Retry' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('dismisses with onClose', async () => {
    const onClose = jest.fn();
    const { user } = await renderWithProviders(<InlineMessage title="Tip" onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no dismiss button without onClose', async () => {
    await renderWithProviders(<InlineMessage title="Tip" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it.each(VARIANTS)('shows the %s icon', async (variant, icon) => {
    await renderWithProviders(<InlineMessage title="Heads up" variant={variant} />);
    expect(screen.getByText(`icon:${icon}`)).toBeOnTheScreen();
  });

  it.each(['info', 'success'] as const)(
    'announces %s politely, without an alert role',
    async (variant) => {
      await renderWithProviders(<InlineMessage title="Heads up" variant={variant} testID="msg" />);
      // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
      const banner = screen.getByTestId('msg');
      expect(banner).not.toHaveProp('accessibilityRole');
      expect(banner).toHaveProp('accessibilityLiveRegion', 'polite');
    },
  );

  it.each(['warning', 'error'] as const)('leaves a %s to the alert role alone', async (variant) => {
    await renderWithProviders(<InlineMessage title="Heads up" variant={variant} testID="msg" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('msg')).not.toHaveProp('accessibilityLiveRegion');
  });

  it('defaults to the info variant', async () => {
    await renderWithProviders(<InlineMessage title="FYI" />);
    expect(screen.getByText('icon:info')).toBeOnTheScreen();
  });

  it('opens the action href through openUrlSafe', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <InlineMessage
        title="Update"
        action={{ label: 'Learn more', href: 'https://example.test/docs', onPress }}
      />,
    );
    await user.press(screen.getByRole('link', { name: 'Learn more' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test/docs');
  });

  it('has no link and no description unless given', async () => {
    await renderWithProviders(<InlineMessage title="Tip" description="" />);
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
    expect(screen.getByText('Tip')).toBeOnTheScreen();
  });
});
