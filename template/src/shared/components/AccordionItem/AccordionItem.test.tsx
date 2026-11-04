import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { AccordionItem } from './AccordionItem';

describe('AccordionItem', () => {
  it('is collapsed by default and hides its content from assistive tech', async () => {
    await renderWithProviders(
      <AccordionItem title="Shipping">
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeCollapsed();
    expect(screen.queryByText('Ships in 2 days')).not.toBeOnTheScreen();
  });

  it('expands and collapses from the header when uncontrolled', async () => {
    const onToggle = jest.fn();
    const { user } = await renderWithProviders(
      <AccordionItem title="Shipping" onToggle={onToggle}>
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    await user.press(screen.getByRole('button', { name: 'Shipping' }));
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeExpanded();
    expect(screen.getByText('Ships in 2 days')).toBeOnTheScreen();
    expect(onToggle).toHaveBeenLastCalledWith(true);

    await user.press(screen.getByRole('button', { name: 'Shipping' }));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('follows the controlled expanded prop', async () => {
    const onToggle = jest.fn();
    const { user } = await renderWithProviders(
      <AccordionItem title="Shipping" expanded onToggle={onToggle}>
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    await user.press(screen.getByRole('button', { name: 'Shipping' }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeExpanded();
  });

  it('starts open with defaultExpanded and names the subtitle', async () => {
    await renderWithProviders(
      <AccordionItem title="Returns" subtitle="30 days" defaultExpanded>
        <Text>Free returns</Text>
      </AccordionItem>,
    );
    expect(screen.getByRole('button', { name: 'Returns, 30 days' })).toBeExpanded();
    expect(screen.getByText('Free returns')).toBeOnTheScreen();
  });

  it('ignores presses when disabled', async () => {
    const onToggle = jest.fn();
    const { user } = await renderWithProviders(
      <AccordionItem title="Locked" disabled onToggle={onToggle} />,
    );
    await user.press(screen.getByRole('button', { name: 'Locked' }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('hides collapsed content from assistive tech and exposes it once open', async () => {
    const { user } = await renderWithProviders(
      <AccordionItem title="Shipping" testID="item">
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    // The panel stays mounted (it animates its height), so its hiding is observable by testID.
    // eslint-disable-next-line no-restricted-syntax -- hidden panel has no role to query
    const panel = screen.getByTestId('item.content', { includeHiddenElements: true });
    expect(panel).toHaveProp('accessibilityElementsHidden', true);
    expect(panel).toHaveProp('importantForAccessibility', 'no-hide-descendants');

    await user.press(screen.getByRole('button', { name: 'Shipping' }));
    expect(panel).toHaveProp('accessibilityElementsHidden', false);
    expect(panel).toHaveProp('importantForAccessibility', 'auto');
  });

  it('follows a controlled expanded prop that changes', async () => {
    const { rerender } = await renderWithProviders(
      <AccordionItem title="Shipping" expanded={false}>
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeCollapsed();
    await rerender(
      <AccordionItem title="Shipping" expanded>
        <Text>Ships in 2 days</Text>
      </AccordionItem>,
    );
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeExpanded();
    expect(screen.getByText('Ships in 2 days')).toBeOnTheScreen();
  });

  it('reports a disabled header to assistive tech', async () => {
    await renderWithProviders(<AccordionItem title="Locked" disabled />);
    expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();
  });

  it('shows the subtitle and the chevron', async () => {
    await renderWithProviders(
      <AccordionItem title="Returns" subtitle="30 days" icon="info" testID="item" />,
    );
    expect(screen.getByText('30 days')).toBeOnTheScreen();
    // The chevron is a decorative icon, hidden from assistive tech.
    // eslint-disable-next-line no-restricted-syntax -- decorative icon has no role to query
    expect(screen.getByTestId('item.chevron', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
