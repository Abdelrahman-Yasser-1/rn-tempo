import { screen } from '@testing-library/react-native';
import type { SelectorParam } from 'i18next';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Text } from './Text';

describe('Text', () => {
  it('renders its children', async () => {
    await renderWithProviders(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it('caps the font scale at 1.5 by default and allows an override', async () => {
    await renderWithProviders(
      <>
        <Text>Default</Text>
        <Text maxFontSizeMultiplier={2}>Custom</Text>
      </>,
    );
    expect(screen.getByText('Default')).toHaveProp('maxFontSizeMultiplier', 1.5);
    expect(screen.getByText('Custom')).toHaveProp('maxFontSizeMultiplier', 2);
  });

  it('announces display and h1-h3 variants as headings', async () => {
    await renderWithProviders(<Text variant="h1">Title</Text>);
    expect(screen.getByRole('header', { name: 'Title' })).toBeOnTheScreen();
  });

  it('keeps body text out of the heading role', async () => {
    await renderWithProviders(<Text>Body</Text>);
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });

  it('passes testID through', async () => {
    await renderWithProviders(<Text testID="greeting">Hi</Text>);
    expect(screen.getByText('Hi')).toHaveProp('testID', 'greeting');
  });

  it('resolves a tx key (the key itself when no translation exists)', async () => {
    // A selector for a key no locale file has, which the typed `tx` prop rejects by design.
    const missing = (($: Record<string, string>) =>
      $.missingKeyForTest) as unknown as SelectorParam;
    await renderWithProviders(<Text tx={missing} />);
    expect(screen.getByText('missingKeyForTest')).toBeOnTheScreen();
  });
});
