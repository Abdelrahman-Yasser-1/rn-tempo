import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('is an unchecked checkbox labelled by its label', async () => {
    await renderWithProviders(<Checkbox checked={false} onChange={jest.fn()} label="Accept" />);
    expect(screen.getByRole('checkbox', { name: 'Accept' })).not.toBeChecked();
  });

  it('reports checked state to assistive tech', async () => {
    await renderWithProviders(<Checkbox checked onChange={jest.fn()} label="Accept" />);
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked();
  });

  it('calls onChange with the negated value when pressed', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Checkbox checked={false} onChange={onChange} label="Accept" />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Accept' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('unchecks when pressed while checked', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Checkbox checked onChange={onChange} label="Accept" />,
    );
    await user.press(screen.getByRole('checkbox', { name: 'Accept' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('ignores presses when disabled', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Checkbox checked={false} disabled onChange={onChange} label="Accept" />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Accept' });
    expect(checkbox).toBeDisabled();
    await user.press(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prefers accessibilityLabel over the visible label', async () => {
    await renderWithProviders(
      <Checkbox checked={false} onChange={jest.fn()} label="Accept" accessibilityLabel="Terms" />,
    );
    expect(screen.getByRole('checkbox', { name: 'Terms' })).toBeOnTheScreen();
  });
});
