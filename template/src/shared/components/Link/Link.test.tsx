import { screen } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Text } from '../Text';

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
});
