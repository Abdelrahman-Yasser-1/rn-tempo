import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListItemContent } from './ListItemContent';

/** Text content of every rendered text node, in tree order. */
function textOrder(): string[] {
  const tree = JSON.stringify(screen.toJSON());
  return [...tree.matchAll(/"(Title|Sub|Meta)"/g)].map((match) => match[1] ?? '');
}

/** Test ids of decorative, screen-reader-hidden views are the only handle on them. */
/* eslint-disable no-restricted-syntax -- decorative views have no accessible role */
const getHidden = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
const queryHidden = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
/* eslint-enable no-restricted-syntax */

describe('ListItemContent', () => {
  it('renders the title, subtitle and meta', async () => {
    await renderWithProviders(<ListItemContent title="Title" subtitle="Sub" meta="Meta" />);
    expect(screen.getByText('Title')).toBeOnTheScreen();
    expect(screen.getByText('Sub')).toBeOnTheScreen();
    expect(screen.getByText('Meta')).toBeOnTheScreen();
  });

  it.each(['default', 'stacked', 'inline'] as const)(
    'renders title, subtitle and meta in the %s layout',
    async (layout) => {
      await renderWithProviders(
        <ListItemContent title="Title" subtitle="Sub" meta="Meta" layout={layout} />,
      );
      expect(screen.getByText('Title')).toBeOnTheScreen();
      expect(screen.getByText('Sub')).toBeOnTheScreen();
      expect(screen.getByText('Meta')).toBeOnTheScreen();
    },
  );

  it('puts the meta beside the title in the inline layout and under the subtitle otherwise', async () => {
    const { rerender } = await renderWithProviders(
      <ListItemContent title="Title" subtitle="Sub" meta="Meta" layout="inline" />,
    );
    expect(textOrder()).toEqual(['Title', 'Meta', 'Sub']);
    await rerender(<ListItemContent title="Title" subtitle="Sub" meta="Meta" />);
    expect(textOrder()).toEqual(['Title', 'Sub', 'Meta']);
  });

  it('omits the meta when it is empty', async () => {
    await renderWithProviders(<ListItemContent title="Title" meta="" partsTestID="row" />);
    expect(queryHidden('row.meta')).not.toBeOnTheScreen();
  });

  it('shows an icon, avatar or image as the leading slot', async () => {
    await renderWithProviders(
      <>
        <ListItemContent title="A" testID="icon" leading={{ type: 'icon', name: 'home' }} />
        <ListItemContent title="B" leading={{ type: 'avatar', name: 'Ada Lovelace' }} />
        <ListItemContent
          title="C"
          leading={{
            type: 'image',
            source: { uri: 'https://example.com/a.png' },
            accessibilityLabel: 'Cover art',
          }}
        />
      </>,
    );
    expect(getHidden('icon.leading')).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'Ada Lovelace' })).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'Cover art' })).toBeOnTheScreen();
  });

  it('shows a chevron, text or badge as the trailing slot', async () => {
    await renderWithProviders(
      <>
        <ListItemContent title="A" testID="chevron" trailing={{ type: 'chevron' }} />
        <ListItemContent title="B" trailing={{ type: 'text', text: 'Edit' }} />
        <ListItemContent title="C" trailing={{ type: 'badge', label: 'New' }} />
        <ListItemContent title="D" trailing={{ type: 'badge', count: 120 }} />
      </>,
    );
    expect(getHidden('chevron.trailing')).toBeOnTheScreen();
    expect(screen.getByText('Edit')).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('shows a switch trailing slot named by the title that reports changes', async () => {
    const onValueChange = jest.fn();
    const { user } = await renderWithProviders(
      <ListItemContent
        title="Notifications"
        trailing={{ type: 'switch', value: false, onValueChange }}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    expect(toggle).not.toBeChecked();
    await user.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('lets left and right override the typed slots', async () => {
    await renderWithProviders(
      <ListItemContent
        title="Row"
        leading={{ type: 'avatar', name: 'Ada Lovelace' }}
        trailing={{ type: 'text', text: 'typed' }}
        left={<Text>custom left</Text>}
        right={<Text>custom right</Text>}
      />,
    );
    expect(screen.getByText('custom left')).toBeOnTheScreen();
    expect(screen.getByText('custom right')).toBeOnTheScreen();
    expect(screen.queryByRole('image', { name: 'Ada Lovelace' })).not.toBeOnTheScreen();
    expect(screen.queryByText('typed')).not.toBeOnTheScreen();
  });
});
