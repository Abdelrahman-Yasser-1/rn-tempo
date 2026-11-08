import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Image } from './Image';

const SOURCE = { uri: 'https://example.com/photo.png' };

/** Fails the native load; FastImage reports it through its `onFastImageError` prop. */
function failNativeLoad() {
  // The image container is hidden from screen readers until it fails, so testID is the handle.
  // eslint-disable-next-line rn-tempo/discouraged-syntax -- decorative native view: testID is the only handle
  const nativeImage = screen.getByTestId('pic.image', { includeHiddenElements: true });
  void fireEvent(nativeImage, 'fastImageError');
}

/** Test ids of decorative, screen-reader-hidden views are the only handle on them. */
/* eslint-disable rn-tempo/discouraged-syntax -- decorative views have no accessible role */
const getHidden = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
const queryHidden = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true });
/* eslint-enable rn-tempo/discouraged-syntax */

describe('Image', () => {
  it('is an informative image when given an accessibilityLabel', async () => {
    await renderWithProviders(<Image source={SOURCE} accessibilityLabel="Sunset" />);
    expect(screen.getByRole('image', { name: 'Sunset' })).toBeOnTheScreen();
  });

  it('is hidden from screen readers when decorative', async () => {
    // Decorative images have no role, so the container is only reachable by testID.

    await renderWithProviders(<Image source={SOURCE} testID="pic" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- decorative element: testID is the only handle
    expect(screen.getByTestId('pic', { includeHiddenElements: true })).toHaveProp(
      'accessibilityElementsHidden',
      true,
    );
  });

  it('applies the requested size to its container', async () => {
    await renderWithProviders(
      <Image source={SOURCE} width={120} height={80} accessibilityLabel="A" />,
    );
    expect(screen.getByRole('image', { name: 'A' })).toHaveStyle({ width: 120, height: 80 });
  });

  it('swaps in the default fallback icon when loading fails', async () => {
    await renderWithProviders(<Image source={SOURCE} testID="pic" accessibilityLabel="Broken" />);
    failNativeLoad();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- fallback wrapper has no role
    const fallback = await screen.findByTestId('pic.fallback', { includeHiddenElements: true });
    expect(fallback).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'Broken' })).toBeOnTheScreen();
  });

  it('renders a custom fallback when provided', async () => {
    await renderWithProviders(
      <Image
        source={SOURCE}
        testID="pic"
        accessibilityLabel="Broken"
        fallback={<Text>No photo</Text>}
      />,
    );
    failNativeLoad();
    expect(await screen.findByText('No photo')).toBeOnTheScreen();
  });

  it('shows a loading placeholder until the image loads', async () => {
    await renderWithProviders(<Image source={SOURCE} testID="pic" accessibilityLabel="Sunset" />);
    expect(getHidden('pic.loading')).toBeOnTheScreen();

    void fireEvent(getHidden('pic.image'), 'fastImageLoad');
    await waitFor(() => {
      expect(queryHidden('pic.loading')).not.toBeOnTheScreen();
    });
  });

  it('drops the placeholder and image once loading fails', async () => {
    await renderWithProviders(<Image source={SOURCE} testID="pic" accessibilityLabel="Broken" />);
    failNativeLoad();
    await waitFor(() => {
      expect(queryHidden('pic.loading')).not.toBeOnTheScreen();
      expect(queryHidden('pic.image')).not.toBeOnTheScreen();
    });
  });

  it('resets to loading when the source changes after a failure', async () => {
    const { rerender } = await renderWithProviders(
      <Image source={SOURCE} testID="pic" accessibilityLabel="Photo" />,
    );
    failNativeLoad();
    await waitFor(() => {
      expect(getHidden('pic.fallback')).toBeOnTheScreen();
    });

    await rerender(
      <Image
        source={{ uri: 'https://example.com/other.png' }}
        testID="pic"
        accessibilityLabel="Photo"
      />,
    );
    expect(getHidden('pic.loading')).toBeOnTheScreen();
    expect(queryHidden('pic.fallback')).not.toBeOnTheScreen();
  });
});
