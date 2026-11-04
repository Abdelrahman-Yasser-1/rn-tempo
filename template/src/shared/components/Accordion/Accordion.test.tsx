import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Accordion } from './Accordion';

const ITEMS = [
  { key: 'a', title: 'First', content: <Text>First body</Text> },
  { key: 'b', title: 'Second', content: <Text>Second body</Text> },
];

describe('Accordion', () => {
  it('opens one item at a time by default', async () => {
    const { user } = await renderWithProviders(<Accordion items={ITEMS} />);
    await user.press(screen.getByRole('button', { name: 'First' }));
    await user.press(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('button', { name: 'First' })).toBeCollapsed();
    expect(screen.getByRole('button', { name: 'Second' })).toBeExpanded();
  });

  it('keeps several items open with allowMultiple', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Accordion items={ITEMS} allowMultiple onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'First' }));
    await user.press(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('button', { name: 'First' })).toBeExpanded();
    expect(screen.getByRole('button', { name: 'Second' })).toBeExpanded();
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('honours defaultExpandedKeys', async () => {
    await renderWithProviders(<Accordion items={ITEMS} defaultExpandedKeys={['b']} />);
    expect(screen.getByRole('button', { name: 'Second' })).toBeExpanded();
    expect(screen.getByRole('button', { name: 'First' })).toBeCollapsed();
  });

  it('closes the open item when its header is pressed again', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Accordion items={ITEMS} defaultExpandedKeys={['a']} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('button', { name: 'First' })).toBeCollapsed();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('closes just the pressed item with allowMultiple', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Accordion
        items={ITEMS}
        allowMultiple
        defaultExpandedKeys={['a', 'b']}
        onChange={onChange}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('button', { name: 'First' })).toBeCollapsed();
    expect(screen.getByRole('button', { name: 'Second' })).toBeExpanded();
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('follows expandedKeys and only reports the change when controlled', async () => {
    const onChange = jest.fn();
    const { user, rerender } = await renderWithProviders(
      <Accordion items={ITEMS} expandedKeys={['a']} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Second' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
    // The parent did not accept the change, so nothing moves.
    expect(screen.getByRole('button', { name: 'First' })).toBeExpanded();
    expect(screen.getByRole('button', { name: 'Second' })).toBeCollapsed();

    await rerender(<Accordion items={ITEMS} expandedKeys={['b']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'First' })).toBeCollapsed();
    expect(screen.getByRole('button', { name: 'Second' })).toBeExpanded();
  });

  it('keeps a disabled item shut', async () => {
    const onChange = jest.fn();
    const items = ITEMS.map((item) => ({ ...item, disabled: item.key === 'a' }));
    const { user } = await renderWithProviders(<Accordion items={items} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'First' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('suffixes the testID of each item with its key', async () => {
    await renderWithProviders(<Accordion items={ITEMS} testID="faq" />);
    // eslint-disable-next-line no-restricted-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('faq.b')).toBeOnTheScreen();
  });
});
