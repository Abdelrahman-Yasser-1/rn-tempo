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
});
