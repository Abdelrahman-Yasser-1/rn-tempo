import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FilterBar } from './FilterBar';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
] as const;

describe('FilterBar', () => {
  it('marks the selected chips and toggles one on press', async () => {
    const onToggle = jest.fn();
    const { user } = await renderWithProviders(
      <FilterBar filters={FILTERS} selected={['open']} onToggle={onToggle} />,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Done' })).not.toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(onToggle).toHaveBeenCalledWith('done');
  });

  it('shows the filter button with the active count and calls onFilterPress', async () => {
    const onFilterPress = jest.fn();
    const { user } = await renderWithProviders(
      <FilterBar
        filters={FILTERS}
        selected={[]}
        onToggle={jest.fn()}
        onFilterPress={onFilterPress}
        filterCount={3}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Filters, 3 active' }));
    expect(onFilterPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('3')).toBeOnTheScreen();
  });

  it('has no filter button without onFilterPress', async () => {
    await renderWithProviders(<FilterBar filters={FILTERS} selected={[]} onToggle={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeOnTheScreen();
  });
});
