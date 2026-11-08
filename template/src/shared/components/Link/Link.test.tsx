import { screen } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { Text } from '@shared/components/Text';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Link } from './Link';

jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

describe('Link', () => {
  it('is a link that calls onPress', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<Link onPress={onPress}>See all</Link>);
    await user.press(screen.getByRole('link', { name: 'See all' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens its href safely', async () => {
    const { user } = await renderWithProviders(<Link href="https://example.test">Terms</Link>);
    await user.press(screen.getByRole('link', { name: 'Terms' }));
    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test');
  });

  it('does nothing when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Link onPress={onPress} disabled>
        Locked
      </Link>,
    );
    const link = screen.getByRole('link', { name: 'Locked' });
    expect(link).toBeDisabled();
    await user.press(link);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('works inline inside a Text', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Text>
        Read the{' '}
        <Link inline onPress={onPress}>
          policy
        </Link>
      </Text>,
    );
    await user.press(screen.getByRole('link', { name: 'policy' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('runs onPress before it opens the href', async () => {
    const calls: string[] = [];
    jest.mocked(openUrlSafe).mockImplementationOnce((url) => {
      calls.push(`open ${url}`);
      return Promise.resolve(true);
    });
    const { user } = await renderWithProviders(
      <Link
        href="https://example.test"
        onPress={() => {
          calls.push('press');
        }}
      >
        Terms
      </Link>,
    );
    await user.press(screen.getByRole('link', { name: 'Terms' }));
    expect(calls).toEqual(['press', 'open https://example.test']);
  });

  it('opens nothing without an href', async () => {
    jest.mocked(openUrlSafe).mockClear();
    const { user } = await renderWithProviders(<Link onPress={jest.fn()}>Plain</Link>);
    await user.press(screen.getByRole('link', { name: 'Plain' }));
    expect(openUrlSafe).not.toHaveBeenCalled();
  });

  it('ignores an empty href', async () => {
    jest.mocked(openUrlSafe).mockClear();
    const { user } = await renderWithProviders(<Link href="">Empty</Link>);
    await user.press(screen.getByRole('link', { name: 'Empty' }));
    expect(openUrlSafe).not.toHaveBeenCalled();
  });

  it('does not open the href when disabled', async () => {
    jest.mocked(openUrlSafe).mockClear();
    const { user } = await renderWithProviders(
      <Link href="https://example.test" disabled>
        Locked
      </Link>,
    );
    await user.press(screen.getByRole('link', { name: 'Locked' }));
    expect(openUrlSafe).not.toHaveBeenCalled();
  });

  it('does nothing when an inline link is disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Text>
        Read the{' '}
        <Link inline disabled onPress={onPress}>
          policy
        </Link>
      </Text>,
    );
    const link = screen.getByRole('link', { name: 'policy' });
    expect(link).toBeDisabled();
    await user.press(link);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('opens the href from an inline link', async () => {
    jest.mocked(openUrlSafe).mockClear();
    const { user } = await renderWithProviders(
      <Text>
        See the{' '}
        <Link inline href="https://example.test/privacy">
          privacy policy
        </Link>
      </Text>,
    );
    await user.press(screen.getByRole('link', { name: 'privacy policy' }));
    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test/privacy');
  });

  it('uses the accessibilityLabel as the name when given', async () => {
    await renderWithProviders(<Link accessibilityLabel="Read the terms">Terms</Link>);
    expect(screen.getByRole('link', { name: 'Read the terms' })).toBeOnTheScreen();
  });

  it.each(['underline', 'plain'] as const)('renders the %s variant', async (variant) => {
    await renderWithProviders(<Link variant={variant}>Variant</Link>);
    expect(screen.getByRole('link', { name: 'Variant' })).toBeOnTheScreen();
  });
});
