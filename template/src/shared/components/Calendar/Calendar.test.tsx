import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Calendar } from './Calendar';

describe('Calendar', () => {
  it('shows the month title and a button per day, labelled with the full date', async () => {
    await renderWithProviders(
      <Calendar initialMonth="2026-11" value="2026-11-04" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'November 2026' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Wednesday, November 4, 2026' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Thursday, November 5, 2026' })).not.toBeSelected();
    // Out-of-month days are part of the six-week grid and stay selectable.
    expect(screen.getByRole('button', { name: 'Tuesday, December 1, 2026' })).toBeEnabled();
  });

  it('reports the tapped day', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-18');
  });

  it('does not select disabled days', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Calendar
        initialMonth="2026-11"
        minDate="2026-11-10"
        disabledDates={['2026-11-12']}
        onChange={onChange}
      />,
    );
    const early = screen.getByRole('button', { name: 'Monday, November 9, 2026' });
    expect(early).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thursday, November 12, 2026' })).toBeDisabled();
    await user.press(early);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps between months and stops at the bounds', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" minDate="2026-11-01" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
  });

  it('switches to the month grid from the title and back on a pick', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'November 2026' }));
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'March 2026' }));
    expect(screen.getByRole('button', { name: 'Sunday, March 1, 2026' })).toBeOnTheScreen();
  });

  it('prints the label from renderDayLabel', async () => {
    await renderWithProviders(
      <Calendar
        initialMonth="2026-11"
        renderDayLabel={(_iso, label) => `d${label}`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('d18')).toBeOnTheScreen();
  });
});
