import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkColors, lightColors } from '@theme/tokens';

import { SegmentedControl } from './SegmentedControl';

const ITEMS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

describe('SegmentedControl', () => {
  it('renders every segment with the selected one marked', async () => {
    await renderWithProviders(<SegmentedControl items={ITEMS} value="week" onChange={jest.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Week' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Day' })).not.toBeSelected();
  });

  it('calls onChange with the pressed segment key', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <SegmentedControl items={ITEMS} value="day" onChange={onChange} />,
    );
    await user.press(screen.getByRole('tab', { name: 'Month' }));
    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('shows at most four segments', async () => {
    const many = [...ITEMS, { key: 'year', label: 'Year' }, { key: 'all', label: 'All' }];
    await renderWithProviders(<SegmentedControl items={many} value="day" onChange={jest.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('keeps the idle label at AA contrast on the track in the %s theme', (_n, colors) => {
    expect(contrast(colors.textSecondary, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textPrimary, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps only the first four segments, in order', async () => {
    const many = [...ITEMS, { key: 'year', label: 'Year' }, { key: 'all', label: 'All' }];
    await renderWithProviders(<SegmentedControl items={many} value="day" onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Year' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeOnTheScreen();
  });

  it('works with two segments and moves the selection with the value', async () => {
    const two = ITEMS.slice(0, 2);
    const { rerender } = await renderWithProviders(
      <SegmentedControl items={two} value="day" onChange={jest.fn()} />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Day' })).toBeSelected();

    await rerender(<SegmentedControl items={two} value="week" onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Week' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Day' })).not.toBeSelected();
  });

  it('is a tablist and offers a thumb under the selection', async () => {
    await renderWithProviders(
      <SegmentedControl items={ITEMS} value="day" onChange={jest.fn()} testID="seg" />,
    );
    // The track holds the tabs, so it is not an accessibility element itself.
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('seg')).toHaveProp('accessibilityRole', 'tablist');
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the thumb is decorative
    expect(screen.getByTestId('seg.thumb')).toBeOnTheScreen();
  });
});
