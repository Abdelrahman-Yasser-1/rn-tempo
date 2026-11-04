import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { contrast } from '@theme/testContrast';
import { darkColors, lightColors } from '@theme/tokens';

import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('marks the current page and calls onChange for another page', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Pagination page={2} pageCount={5} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Page 4' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('steps with the previous and next arrows', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Pagination page={3} pageCount={5} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Previous page' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    await user.press(screen.getByRole('button', { name: 'Next page' }));
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('disables the arrows at the ends and shows an ellipsis for skipped pages', async () => {
    await renderWithProviders(<Pagination page={1} pageCount={20} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByText('…', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeOnTheScreen();
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('keeps the selected page label at AA contrast in the %s theme', (_name, colors) => {
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
