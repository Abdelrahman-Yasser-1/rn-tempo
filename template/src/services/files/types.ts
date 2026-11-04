/** A file chosen by the user, whichever source it came from. */
export type PickedFile = Readonly<{
  uri: string;
  name: string;
  /** MIME type, e.g. `image/jpeg`; `application/octet-stream` when the OS did not report one. */
  type: string;
  /** Size in bytes; `0` when the OS did not report one. */
  size: number;
}>;

/** Where the user can get a file from. */
export type FileSource = 'camera' | 'library' | 'files';

/** Why picking failed; a cancelled pick is not an error (it returns an empty list). */
export type FilePickErrorCode = 'cameraUnavailable' | 'permissionDenied' | 'unknown';

/** Thrown by `pickDocument` and `pickImage`; `code` tells the UI which message to show. */
export class FilePickError extends Error {
  readonly code: FilePickErrorCode;

  constructor(code: FilePickErrorCode, cause?: unknown) {
    super(`File pick failed: ${code}`, { cause });
    this.name = 'FilePickError';
    this.code = code;
  }
}
