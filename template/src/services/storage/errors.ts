/** Thrown when storage is used before `initStorage()` resolved. */
export class StorageNotReadyError extends Error {
  /** Creates the error with the standard guidance message. */
  constructor() {
    super('Storage accessed before initStorage() resolved. Await initStorage() during bootstrap.');
    this.name = 'StorageNotReadyError';
  }
}
