import { StorageError, StorageNotReadyError } from './errors';

describe('storage errors', () => {
  test('StorageError wraps the cause and is operational by default', () => {
    const cause = new Error('keychain locked');

    const error = new StorageError('Could not read the key', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'StorageError', isOperational: true, cause });
  });

  test('StorageError can be marked as a bug', () => {
    expect(new StorageError('x', { isOperational: false }).isOperational).toBe(false);
  });

  test('StorageNotReadyError keeps its name and message and is not operational', () => {
    const error = new StorageNotReadyError();

    expect(error).toBeInstanceOf(StorageError);
    expect(error.name).toBe('StorageNotReadyError');
    expect(error.message).toBe(
      'Storage accessed before initStorage() resolved. Await initStorage() during bootstrap.',
    );
    expect(error.isOperational).toBe(false);
  });
});
