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

  it('reports the tapped month with the opening year', async () => {
    const onSelect = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearGrid year={2026} month={10} onSelect={onSelect} />,
    );
    await user.press(screen.getByRole('button', { name: 'January 2026' }));
    expect(onSelect).toHaveBeenCalledWith(2026, 0);
  });

  it('shows the selected month only in the selected year', async () => {
    const { user } = await renderWithProviders(
      <MonthYearGrid year={2026} month={10} onSelect={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: '2027' }));
    expect(screen.getByRole('button', { name: 'November 2027' })).not.toBeSelected();
    await user.press(screen.getByRole('button', { name: '2026' }));
    expect(screen.getByRole('button', { name: 'November 2026' })).toBeSelected();
  });

  it('recomputes the disabled months for the year being browsed', async () => {
    const { user } = await renderWithProviders(
      <MonthYearGrid
        year={2026}
        month={10}
        minMonth="2026-03"
        maxMonth="2027-05"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: '2027' }));
    expect(screen.getByRole('button', { name: 'January 2027' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'May 2027' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'June 2027' })).toBeDisabled();
  });

  it('does not report a month before minMonth', async () => {
    const onSelect = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearGrid year={2026} month={10} minMonth="2026-06" onSelect={onSelect} />,
    );
    await user.press(screen.getByRole('button', { name: 'May 2026' }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'June 2026' }));
    expect(onSelect).toHaveBeenCalledWith(2026, 5);
  });

  it('disables a year outside the range that the grid opened on', async () => {
    await renderWithProviders(
      <MonthYearGrid
        year={2029}
        month={0}
        minMonth="2026-01"
        maxMonth="2027-12"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '2029' })).toBeDisabled();
  });

  it('lists Arabic month names with Latin digits', async () => {
    await renderWithProviders(<MonthYearGrid year={2026} month={10} onSelect={jest.fn()} />, {
      language: 'ar',
    });
    expect(screen.getByRole('button', { name: 'نوفمبر 2026' })).toBeSelected();
    expect(screen.getByRole('button', { name: '2026' })).toBeOnTheScreen();
  });
});
