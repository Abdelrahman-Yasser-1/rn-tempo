import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListItem } from './ListItem';

/** Test ids of decorative, screen-reader-hidden views are the only handle on them. */
/* eslint-disable rn-tempo/discouraged-syntax -- decorative views have no accessible role */
const getHidden = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
const queryHidden = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
/* eslint-enable rn-tempo/discouraged-syntax */

describe('ListItem', () => {
  it('renders a non-pressable row without a button role', async () => {
    await renderWithProviders(<ListItem title="Language" subtitle="English" />);
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('English')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('becomes a button named by title and subtitle when pressable', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <ListItem title="Language" subtitle="English" onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Language, English' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers accessibilityLabel over the composed name', async () => {
    await renderWithProviders(
      <ListItem title="Language" onPress={jest.fn()} accessibilityLabel="Change language" />,
    );
    expect(screen.getByRole('button', { name: 'Change language' })).toBeOnTheScreen();
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <ListItem title="Locked" disabled onPress={onPress} />,
    );
    const item = screen.getByRole('button', { name: 'Locked' });
    expect(item).toBeDisabled();
    await user.press(item);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a chevron only for pressable rows that ask for one', async () => {
    await renderWithProviders(
      <>
        <ListItem title="Plain" showChevron />
        <ListItem title="Tap" showChevron onPress={jest.fn()} />
      </>,
    );
    // The chevron is decorative, so the only observable difference is the pressable row.
    expect(screen.getByRole('button', { name: 'Tap' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plain' })).not.toBeOnTheScreen();
  });

  it('renders the right slot in place of the chevron', async () => {
    await renderWithProviders(
      <ListItem title="Toggle" showChevron onPress={jest.fn()} right={<Text>On</Text>} />,
    );
    expect(screen.getByText('On')).toBeOnTheScreen();
  });

  it('shows a typed chevron trailing slot on a pressable row', async () => {
    await renderWithProviders(
      <ListItem title="Tap" testID="row" onPress={jest.fn()} showChevron />,
    );
    expect(getHidden('row.trailing')).toBeOnTheScreen();
  });

  it('shows no chevron for a non-pressable row even when asked', async () => {
    await renderWithProviders(<ListItem title="Plain" testID="row" showChevron />);
    expect(queryHidden('row.trailing')).not.toBeOnTheScreen();
  });

  it('keeps the legacy left and right slots working', async () => {
    await renderWithProviders(
      <ListItem title="Legacy" left={<Text>L</Text>} right={<Text>R</Text>} />,
    );
    expect(screen.getByText('L')).toBeOnTheScreen();
    expect(screen.getByText('R')).toBeOnTheScreen();
  });

  it('prefers right over trailing and over the chevron', async () => {
    await renderWithProviders(
      <ListItem
        title="Row"
        testID="row"
        onPress={jest.fn()}
        showChevron
        trailing={{ type: 'text', text: 'typed' }}
        right={<Text>custom</Text>}
      />,
    );
    expect(screen.getByText('custom')).toBeOnTheScreen();
    expect(screen.queryByText('typed')).not.toBeOnTheScreen();
  });

  it('forwards typed leading, trailing and layout to the content', async () => {
    await renderWithProviders(
      <ListItem
        title="Ada"
        meta="2m ago"
        layout="inline"
        leading={{ type: 'avatar', name: 'Ada Lovelace' }}
        trailing={{ type: 'badge', label: 'New' }}
      />,
    );
    expect(screen.getByRole('image', { name: 'Ada Lovelace' })).toBeOnTheScreen();
    expect(screen.getByText('2m ago')).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('presses through the row when the typed trailing slot is text', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <ListItem title="Row" onPress={onPress} trailing={{ type: 'text', text: 'Edit' }} />,
    );
    await user.press(screen.getByRole('button', { name: 'Row' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
