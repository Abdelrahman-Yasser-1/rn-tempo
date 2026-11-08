import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Loader } from './Loader';

describe('Loader', () => {
  it('is a busy progress bar', async () => {
    await renderWithProviders(<Loader />);
    expect(screen.getByRole('progressbar')).toBeBusy();
  });

  it('uses the visible label as the accessible name', async () => {
    await renderWithProviders(<Loader label="Fetching orders" />);
    expect(screen.getByRole('progressbar', { name: 'Fetching orders' })).toBeOnTheScreen();
    expect(screen.getByText('Fetching orders')).toBeOnTheScreen();
  });

  it('falls back to a translated default name when no label is given', async () => {
    await renderWithProviders(<Loader />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
  });

  it('maps the sm size to a small spinner and lg to a large one', async () => {
    await renderWithProviders(
      <>
        <Loader size="sm" testID="small" />
        <Loader size="lg" testID="large" />
      </>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- ActivityIndicator has no accessible role
    expect(screen.getByTestId('small.spinner')).toHaveProp('size', 'small');
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- ActivityIndicator has no accessible role
    expect(screen.getByTestId('large.spinner')).toHaveProp('size', 'large');
  });

  it('is not modal when inline', async () => {
    await renderWithProviders(<Loader label="Saving" />);
    expect(screen.getByRole('progressbar', { name: 'Saving' })).toHaveProp(
      'accessibilityViewIsModal',
      false,
    );
  });

  it('is announced as a modal and claims touches when an overlay', async () => {
    await renderWithProviders(<Loader variant="overlay" label="Uploading" />);
    const overlay = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(overlay).toHaveProp('accessibilityViewIsModal', true);
    expect(overlay).toBeBusy();
    expect(screen.getByText('Uploading')).toBeOnTheScreen();
    const claimTouches = overlay.props.onStartShouldSetResponder as () => boolean;
    expect(claimTouches()).toBe(true);
  });

  it('does not claim touches when inline', async () => {
    await renderWithProviders(<Loader />);
    expect(screen.getByRole('progressbar').props.onStartShouldSetResponder).toBeUndefined();
  });
});
