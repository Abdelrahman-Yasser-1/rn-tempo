import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MonthYearGrid } from './MonthYearGrid';

describe('MonthYearGrid', () => {
  it('lists twelve months and marks the selected one', async () => {
    await renderWithProviders(
      <MonthYearGrid testID="grid" year={2026} month={10} onSelect={jest.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: /^\w+ 2026$/ })).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'November 2026' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'March 2026' })).not.toBeSelected();
  });

  it('reports the tapped month with the browsed year', async () => {
    const onSelect = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearGrid testID="grid" year={2026} month={10} onSelect={onSelect} />,
    );
    await user.press(screen.getByRole('button', { name: '2027' }));
    await user.press(screen.getByRole('button', { name: 'March 2027' }));
    expect(onSelect).toHaveBeenCalledWith(2027, 2);
  });

  it('disables months outside the range', async () => {
    await renderWithProviders(
      <MonthYearGrid
        testID="grid"
        year={2026}
        month={10}
        minMonth="2026-03"
        maxMonth="2026-11"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'February 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeDisabled();
  });
});
