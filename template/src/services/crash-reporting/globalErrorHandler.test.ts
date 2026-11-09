import { installRedactingErrorHandler, toRedactedError } from './globalErrorHandler';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

describe('toRedactedError', () => {
  test('an Error keeps its name and loses secrets in message and stack', () => {
    const error = new TypeError(`request with Bearer ${JWT} failed`);

    const redacted = toRedactedError(error);

    expect(redacted.name).toBe('TypeError');
    expect(redacted.message).not.toContain(JWT);
    expect(redacted.stack).not.toContain(JWT);
  });

  test('a thrown string is wrapped and redacted; other values keep only their type', () => {
    expect(toRedactedError(`token ${JWT}`).message).not.toContain(JWT);
    expect(toRedactedError({ password: 'hunter2' }).message).toBe(
      'Non-error value thrown: [object Object]',
    );
  });
});

describe('installRedactingErrorHandler', () => {
  test('the previous handler (the provider SDK) only receives a redacted copy', () => {
    const original = ErrorUtils.getGlobalHandler();
    const provider = jest.fn<undefined, [unknown, boolean | undefined]>();
    ErrorUtils.setGlobalHandler(provider);

    const restore = installRedactingErrorHandler();
    ErrorUtils.getGlobalHandler()(new Error(`Bearer ${JWT}`), true);
    restore();

    const [received, isFatal] = provider.mock.calls[0] ?? [];
    expect(received).toBeInstanceOf(Error);
    expect(isFatal).toBe(true);
    expect(JSON.stringify(received, Object.getOwnPropertyNames(received))).not.toContain(JWT);
    expect(ErrorUtils.getGlobalHandler()).toBe(provider);
    ErrorUtils.setGlobalHandler(original);
  });
});
