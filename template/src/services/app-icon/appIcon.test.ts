import { appIconService } from './index';
import NativeAppIcon, { type Spec } from './NativeAppIcon';

if (!NativeAppIcon) {
  throw new Error('Expected native app icon Jest mock');
}
const native = jest.mocked(NativeAppIcon);

it.each([
  ['default', null],
  ['ocean', 'Ocean'],
  ['forest', 'Forest'],
  ['sunset', 'Sunset'],
] as const)('AC-I-1: switches and reads the %s icon', async (name, nativeName) => {
  expect(appIconService.isSupported()).toBe(true);
  await appIconService.setIcon(name);
  expect(native.setIcon.mock.lastCall).toEqual([nativeName]);
  native.getIcon.mockResolvedValueOnce(nativeName);
  await expect(appIconService.getIcon()).resolves.toBe(name);
});

it('AC-I-4: reports an unsupported platform without calling the switch', async () => {
  native.isSupported.mockReturnValue(false);
  native.setIcon.mockClear();
  try {
    expect(appIconService.isSupported()).toBe(false);
    await expect(appIconService.getIcon()).resolves.toBe('default');
    await expect(appIconService.setIcon('ocean')).rejects.toThrow('unsupported');
    expect(native.setIcon.mock.calls).toHaveLength(0);
  } finally {
    native.isSupported.mockReturnValue(true);
  }
});

it('AC-I-4: loads when the native module is absent', async () => {
  const binding = jest.requireMock<{ default: Spec | null }>('./NativeAppIcon');
  const replacement = jest.replaceProperty(binding, 'default', null);
  try {
    expect(appIconService.isSupported()).toBe(false);
    await expect(appIconService.getIcon()).resolves.toBe('default');
    await expect(appIconService.setIcon('forest')).rejects.toThrow('unsupported');
  } finally {
    replacement.restore();
  }
});

it('AC-I-1: propagates native switch errors', async () => {
  const failure = new Error('Icon change failed');
  native.setIcon.mockRejectedValueOnce(failure);
  await expect(appIconService.setIcon('sunset')).rejects.toBe(failure);
});
