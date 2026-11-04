import { screen } from '@testing-library/react-native';

import { formatFullDate, formatMonthYear, toISODate } from '@shared/utils/calendar';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Calendar } from './Calendar';

const dayButton = (iso: string, language = 'en') =>
  screen.getByRole('button', { name: formatFullDate(iso, language) });
const queryDayButton = (iso: string) =>
  screen.queryByRole('button', { name: formatFullDate(iso, 'en') });

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

  it('steps back and forward across a year boundary', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-01" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('button', { name: 'December 2025' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'February 2026' })).toBeOnTheScreen();
  });

  it('stops the next arrow at the month of maxDate', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" maxDate="2026-12-15" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('toggles the title between the day grid and the month grid', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={jest.fn()} />,
    );
    const titleQuery = (isExpanded: boolean) => ({ name: 'November 2026', expanded: isExpanded });
    expect(screen.getByRole('button', titleQuery(false))).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'March 2026' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', titleQuery(false)));
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeOnTheScreen();
    expect(queryDayButton('2026-11-18')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', titleQuery(true))).toBeOnTheScreen();
    // The arrows are inert while the month grid is open.
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();

    await user.press(screen.getByRole('button', titleQuery(true)));
    expect(screen.queryByRole('button', { name: 'March 2026' })).not.toBeOnTheScreen();
    expect(dayButton('2026-11-18')).toBeOnTheScreen();
  });

  it('picks another year and month from the month grid', async () => {
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'November 2026' }));
    await user.press(screen.getByRole('button', { name: '2027' }));
    await user.press(screen.getByRole('button', { name: 'February 2027' }));
    expect(screen.getByRole('button', { name: 'February 2027' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Monday, February 1, 2027' })).toBeOnTheScreen();
  });

  it('disables days outside minDate and maxDate and reports the disabled state', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Calendar
        initialMonth="2026-11"
        minDate="2026-11-10"
        maxDate="2026-11-20"
        onChange={onChange}
      />,
    );
    for (const iso of ['2026-11-09', '2026-11-21']) {
      const cell = dayButton(iso);
      expect(cell).toBeDisabled();
      await user.press(cell);
    }
    expect(dayButton('2026-11-10')).toBeEnabled();
    expect(dayButton('2026-11-20')).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables days from isDateDisabled', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Calendar
        initialMonth="2026-11"
        isDateDisabled={(iso) => iso.endsWith('-14')}
        onChange={onChange}
      />,
    );
    const cell = dayButton('2026-11-14');
    expect(cell).toBeDisabled();
    await user.press(cell);
    expect(onChange).not.toHaveBeenCalled();
    expect(dayButton('2026-11-15')).toBeEnabled();
  });

  it('keeps out-of-month days selectable', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={onChange} />,
    );
    await user.press(dayButton('2026-12-01'));
    expect(onChange).toHaveBeenCalledWith('2026-12-01');
  });

  it('disables an out-of-month day that breaks the bounds', async () => {
    await renderWithProviders(
      <Calendar initialMonth="2026-11" maxDate="2026-11-30" onChange={jest.fn()} />,
    );
    expect(dayButton('2026-12-01')).toBeDisabled();
  });

  it('marks only the selected day as selected', async () => {
    await renderWithProviders(
      <Calendar initialMonth="2026-11" value="2026-11-04" onChange={jest.fn()} />,
    );
    expect(dayButton('2026-11-04')).toBeSelected();
    expect(dayButton('2026-11-05')).not.toBeSelected();
  });

  it('opens on the current month and offers today as an enabled day', async () => {
    const today = toISODate(new Date());
    const [year, month] = today.split('-').map(Number) as [number, number];
    await renderWithProviders(<Calendar onChange={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: formatMonthYear('en', year, month - 1) }),
    ).toBeOnTheScreen();
    expect(dayButton(today)).toBeEnabled();
    expect(screen.getByRole('button', { name: formatFullDate(today, 'en') })).toBeOnTheScreen();
  });

  it('starts the weekday header on firstDayOfWeek', async () => {
    const { rerender } = await renderWithProviders(
      <Calendar initialMonth="2026-11" onChange={jest.fn()} />,
    );
    const headerOrder = () =>
      screen
        .getAllByText(/^[SMTWF]$/, { includeHiddenElements: true })
        .map((node) => node.props.children as string)
        .join('');
    expect(headerOrder()).toBe('SMTWTFS');
    await rerender(<Calendar initialMonth="2026-11" firstDayOfWeek={1} onChange={jest.fn()} />);
    expect(headerOrder()).toBe('MTWTFSS');
  });

  it('hides the weekday header from accessibility', async () => {
    await renderWithProviders(<Calendar initialMonth="2026-11" onChange={jest.fn()} />);
    expect(screen.queryAllByText(/^[SMTWF]$/)).toHaveLength(0);
  });

  it('keeps the full date as the spoken label when renderDayLabel changes the text', async () => {
    await renderWithProviders(
      <Calendar
        initialMonth="2026-11"
        renderDayLabel={(iso) => `h${iso.slice(8)}`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('h18')).toBeOnTheScreen();
    expect(dayButton('2026-11-18')).toHaveAccessibleName('Wednesday, November 18, 2026');
  });

  it('renders Arabic names with Latin digits and a Saturday-first, right-to-left week', async () => {
    await renderWithProviders(
      <Calendar initialMonth="2026-11" value="2026-11-18" onChange={jest.fn()} />,
      { language: 'ar' },
    );
    expect(screen.getByRole('button', { name: 'نوفمبر 2026' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'الشهر السابق' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'الشهر التالي' })).toBeOnTheScreen();
    const cell = screen.getByRole('button', { name: 'الأربعاء، 18 نوفمبر 2026' });
    expect(cell).toBeSelected();
    expect(screen.getByText('18')).toBeOnTheScreen();
    const weekdays = screen
      .getAllByText(/^[\u0600-\u06FF]$/, { includeHiddenElements: true })
      .map((node) => node.props.children as string);
    expect(weekdays).toEqual(['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']);
  });
});
