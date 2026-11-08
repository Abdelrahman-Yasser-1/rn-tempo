import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkColors, lightColors } from '@theme/tokens';

import { Tabs } from './Tabs';

const ITEMS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open', badge: 3 },
  { key: 'done', label: 'Done', icon: 'check' },
] as const;

describe('Tabs', () => {
  it('renders a tablist with the selected tab marked', async () => {
    await renderWithProviders(
      <Tabs items={ITEMS} value="open" onChange={jest.fn()} testID="tabs" />,
    );
    // The container is not an accessibility element (grouping it would hide its tabs).
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('tabs')).toHaveProp('accessibilityRole', 'tablist');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Open, 3' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'All' })).not.toBeSelected();
  });

  it('calls onChange with the pressed tab key', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Tabs items={ITEMS} value="all" variant="pill" onChange={onChange} />,
    );
    await user.press(screen.getByRole('tab', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('keeps selected and idle labels at AA contrast in the %s theme', (_name, colors) => {
    expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('renders the pill variant with every tab', async () => {
    await renderWithProviders(
      <Tabs items={ITEMS} value="done" variant="pill" onChange={jest.fn()} />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Done' })).toBeSelected();
  });

  it('calls onChange for each tab pressed, selected or not', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Tabs items={ITEMS} value="all" onChange={onChange} />,
    );
    await user.press(screen.getByRole('tab', { name: 'Open, 3' }));
    await user.press(screen.getByRole('tab', { name: 'Done' }));
    await user.press(screen.getByRole('tab', { name: 'All' }));
    expect(onChange.mock.calls).toEqual([['open'], ['done'], ['all']]);
  });

  it('shows the badge only on the tab that has one, and folds it into the name', async () => {
    await renderWithProviders(
      <Tabs items={ITEMS} value="all" onChange={jest.fn()} testID="tabs" />,
    );
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'All' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Done' })).toBeOnTheScreen();
  });

  it('moves the selected state when the value changes', async () => {
    const { rerender } = await renderWithProviders(
      <Tabs items={ITEMS} value="all" onChange={jest.fn()} />,
    );
    await rerender(<Tabs items={ITEMS} value="done" onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Done' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'All' })).not.toBeSelected();
  });

  it('marks no tab selected when the value matches none', async () => {
    await renderWithProviders(<Tabs items={ITEMS} value="missing" onChange={jest.fn()} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).not.toBeSelected();
    }
  });
});
