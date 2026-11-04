import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListItemContent } from './ListItemContent';

describe('ListItemContent', () => {
  it('renders the title, subtitle and meta', async () => {
    await renderWithProviders(<ListItemContent title="Title" subtitle="Sub" meta="Meta" />);
    expect(screen.getByText('Title')).toBeOnTheScreen();
    expect(screen.getByText('Sub')).toBeOnTheScreen();
    expect(screen.getByText('Meta')).toBeOnTheScreen();
  });
});
