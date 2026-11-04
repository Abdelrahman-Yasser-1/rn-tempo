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
});
