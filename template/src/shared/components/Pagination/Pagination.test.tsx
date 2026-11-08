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

  it('disables Next on the last page and Previous on the first, but not the other way round', async () => {
    const { rerender } = await renderWithProviders(
      <Pagination page={5} pageCount={5} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();

    await rerender(<Pagination page={1} pageCount={5} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('does not call onChange from a disabled arrow', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Pagination page={1} pageCount={3} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Previous page' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an ellipsis on both sides in the middle of a long range', async () => {
    await renderWithProviders(<Pagination page={10} pageCount={20} onChange={jest.fn()} />);
    expect(screen.getAllByText('…', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Page 9' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Page 11' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Page 5' })).not.toBeOnTheScreen();
  });

  it('shows no ellipsis when every page fits', async () => {
    await renderWithProviders(<Pagination page={2} pageCount={5} onChange={jest.fn()} />);
    expect(screen.queryByText('…', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('hides the ellipsis from assistive tech', async () => {
    await renderWithProviders(<Pagination page={1} pageCount={20} onChange={jest.fn()} />);
    expect(screen.queryByText('…')).not.toBeOnTheScreen();
  });

  it('shows more neighbours with a larger siblings value', async () => {
    await renderWithProviders(
      <Pagination page={10} pageCount={30} siblings={2} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Page 8' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Page 12' })).toBeOnTheScreen();
  });

  it('disables both arrows for a single page', async () => {
    await renderWithProviders(<Pagination page={1} pageCount={1} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeSelected();
  });

  it('suffixes the testIDs of the parts', async () => {
    await renderWithProviders(
      <Pagination page={1} pageCount={3} onChange={jest.fn()} testID="pager" />,
    );
    /* eslint-disable rn-tempo/discouraged-syntax -- checks the testID plumbing itself */
    expect(screen.getByTestId('pager.previous')).toBeOnTheScreen();
    expect(screen.getByTestId('pager.page-2')).toBeOnTheScreen();
    expect(screen.getByTestId('pager.next')).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
  });
});
