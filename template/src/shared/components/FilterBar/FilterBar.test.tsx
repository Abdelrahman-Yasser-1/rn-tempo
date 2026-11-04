import { screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FilterBar } from './FilterBar';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
] as const;

/** Owns the selection like a real screen would, so several chips can be toggled in turn. */
function StatefulFilterBar({ onToggle }: Readonly<{ onToggle: (key: string) => void }>) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <FilterBar
      filters={FILTERS}
      selected={selected}
      onToggle={(key) => {
        onToggle(key);
        setSelected((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        );
      }}
    />
  );
}

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

  it('lets several chips be selected at once and toggled off again', async () => {
    const onToggle = jest.fn();
    const { user } = await renderWithProviders(<StatefulFilterBar onToggle={onToggle} />);
    await user.press(screen.getByRole('button', { name: 'Open' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Open' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Done' })).toBeSelected();

    await user.press(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Open' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Done' })).toBeSelected();
    expect(onToggle.mock.calls).toEqual([['open'], ['done'], ['open']]);
  });

  it('shows the filter button without a badge when nothing is active', async () => {
    await renderWithProviders(
      <FilterBar
        filters={FILTERS}
        selected={[]}
        onToggle={jest.fn()}
        onFilterPress={jest.fn()}
        testID="bar"
      />,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('bar.badge')).not.toBeOnTheScreen();
  });

  it('hides the badge at a count of zero and shows it from one', async () => {
    const { rerender } = await renderWithProviders(
      <FilterBar
        filters={FILTERS}
        selected={[]}
        onToggle={jest.fn()}
        onFilterPress={jest.fn()}
        filterCount={0}
        testID="bar"
      />,
    );
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('bar.badge')).not.toBeOnTheScreen();
    await rerender(
      <FilterBar
        filters={FILTERS}
        selected={[]}
        onToggle={jest.fn()}
        onFilterPress={jest.fn()}
        filterCount={1}
        testID="bar"
      />,
    );
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('bar.badge')).toBeOnTheScreen();
  });

  it('does not show a badge without the filter button', async () => {
    await renderWithProviders(
      <FilterBar
        filters={FILTERS}
        selected={[]}
        onToggle={jest.fn()}
        filterCount={4}
        testID="bar"
      />,
    );
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('bar.badge')).not.toBeOnTheScreen();
  });

  it('passes the testID to each chip by key', async () => {
    await renderWithProviders(
      <FilterBar filters={FILTERS} selected={[]} onToggle={jest.fn()} testID="bar" />,
    );
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('bar.chip-done')).toBeOnTheScreen();
  });
});
