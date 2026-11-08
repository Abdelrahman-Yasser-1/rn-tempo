import { initSecurity } from './initSecurity';
import { useSecurityStore } from './securityStore';

// @tempo-feature:ssl-pinning:start
type PinningOptions = { onSecurityCompromised: (reason: 'ssl') => void };
const mockInitPinning = jest.fn<Promise<boolean>, [PinningOptions]>();
// @tempo-feature:ssl-pinning:end
const mockRunIntegrityPolicy = jest.fn(); // @tempo-feature:device-integrity

// @tempo-feature:ssl-pinning:start
jest.mock('@services/security/pinning/pinning', () => ({
  initPinning: (options: PinningOptions) => mockInitPinning(options),
}));
// @tempo-feature:ssl-pinning:end
// @tempo-feature:device-integrity:start
jest.mock('@services/security/integrity/integrity', () => ({
  runIntegrityPolicy: () => mockRunIntegrityPolicy() as Promise<unknown>,
}));
// @tempo-feature:device-integrity:end

beforeEach(() => {
  jest.clearAllMocks();
  useSecurityStore.setState({ compromisedReasons: [] });
  // @tempo-feature:ssl-pinning:start
  mockInitPinning.mockResolvedValue(true);
  // @tempo-feature:ssl-pinning:end
  // @tempo-feature:device-integrity:start
  mockRunIntegrityPolicy.mockResolvedValue({ shouldBlock: false, reasons: [] });
  // @tempo-feature:device-integrity:end
});

describe('initSecurity', () => {
  test('AC-6: safe when pinning and integrity pass', async () => {
    await expect(initSecurity()).resolves.toEqual({ isSafe: true, reasons: [] });
  });

  // @tempo-feature:ssl-pinning:start
  test('AC-6: pinning failure blocks and skips the integrity check', async () => {
    mockInitPinning.mockResolvedValue(false);

    await expect(initSecurity()).resolves.toEqual({ isSafe: false, reasons: ['ssl'] });
    expect(mockRunIntegrityPolicy).not.toHaveBeenCalled();
  });
  // @tempo-feature:ssl-pinning:end

  // @tempo-feature:device-integrity:start
  test('AC-6: an integrity block carries its reasons', async () => {
    mockRunIntegrityPolicy.mockResolvedValue({ shouldBlock: true, reasons: ['jailbroken'] });

    await expect(initSecurity()).resolves.toEqual({ isSafe: false, reasons: ['jailbroken'] });
  });
  // @tempo-feature:device-integrity:end

  // @tempo-feature:ssl-pinning:start
  test('AC-6: a runtime pin mismatch is recorded in the security store', async () => {
    await initSecurity();
    const options = mockInitPinning.mock.calls[0]?.[0];

    options?.onSecurityCompromised('ssl');
    options?.onSecurityCompromised('ssl');

    expect(useSecurityStore.getState().compromisedReasons).toEqual(['ssl']);
  });
  // @tempo-feature:ssl-pinning:end
});
