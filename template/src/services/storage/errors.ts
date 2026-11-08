export type StorageErrorOptions = {
  /** The keychain or MMKV failure being wrapped. */
  cause?: unknown;
  /** Expected runtime failure (locked keychain, full disk) when true; a programmer bug when false. */
  isOperational?: boolean;
};

/** Wraps a keychain or MMKV failure so callers never depend on the library's error shapes. */
export class StorageError extends Error {
  readonly isOperational: boolean;

  /** Builds the error; failures of the platform are operational unless said otherwise. */
  constructor(
    message: string,
    { cause, isOperational = true }: Readonly<StorageErrorOptions> = {},
  ) {
    super(message, { cause });
    this.name = 'StorageError';
    this.isOperational = isOperational;
  }
}

/** Thrown when storage is used before `initStorage()` resolved: a programmer bug, not operational. */
export class StorageNotReadyError extends StorageError {
  /** Creates the error with the standard guidance message. */
  constructor() {
    super('Storage accessed before initStorage() resolved. Await initStorage() during bootstrap.', {
      isOperational: false,
    });
    this.name = 'StorageNotReadyError';
  }
}
