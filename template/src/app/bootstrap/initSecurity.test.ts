import { initSecurity } from './initSecurity';
import { useSecurityStore } from './securityStore';

type PinningOptions = { onSecurityCompromised: (reason: 'ssl') => void };
const mockInitPinning = jest.fn<Promise<boolean>, [PinningOptions]>();
const mockRunIntegrityPolicy = jest.fn();

jest.mock('@services/security/pinning/pinning', () => ({
  initPinning: (options: PinningOptions) => mockInitPinning(options),
}));
jest.mock('@services/security/integrity/integrity', () => ({
  runIntegrityPolicy: () => mockRunIntegrityPolicy() as Promise<unknown>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  useSecurityStore.setState({ compromisedReasons: [] });
  mockInitPinning.mockResolvedValue(true);
  mockRunIntegrityPolicy.mockResolvedValue({ shouldBlock: false, reasons: [] });
});

describe('initSecurity', () => {
  test('AC-6: safe when pinning and integrity pass', async () => {
    await expect(initSecurity()).resolves.toEqual({ isSafe: true, reasons: [] });
  });

  test('AC-6: pinning failure blocks and skips the integrity check', async () => {
    mockInitPinning.mockResolvedValue(false);

    await expect(initSecurity()).resolves.toEqual({ isSafe: false, reasons: ['ssl'] });
    expect(mockRunIntegrityPolicy).not.toHaveBeenCalled();
  });

  test('AC-6: an integrity block carries its reasons', async () => {
    mockRunIntegrityPolicy.mockResolvedValue({ shouldBlock: true, reasons: ['jailbroken'] });

    await expect(initSecurity()).resolves.toEqual({ isSafe: false, reasons: ['jailbroken'] });
  });

  test('AC-6: a runtime pin mismatch is recorded in the security store', async () => {
    await initSecurity();
    const options = mockInitPinning.mock.calls[0]?.[0];

    options?.onSecurityCompromised('ssl');
    options?.onSecurityCompromised('ssl');

    expect(useSecurityStore.getState().compromisedReasons).toEqual(['ssl']);
  });
});
