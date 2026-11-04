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
});
