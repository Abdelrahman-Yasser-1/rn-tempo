import {
  errorCodes,
  isErrorWithCode,
  pick,
  type DocumentPickerResponse,
} from '@react-native-documents/picker';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type ImagePickerResponse,
} from 'react-native-image-picker';

import { FilePickError, type PickedFile } from './types';

const FALLBACK_TYPE = 'application/octet-stream';
const FALLBACK_IMAGE_TYPE = 'image/jpeg';

export type PickDocumentOptions = Readonly<{
  /** MIME types or wildcards (`image/*`); every file when omitted. */
  accept?: readonly string[];
  /** Lets the user choose several files at once. */
  multiple?: boolean;
}>;

export type PickImageOptions = Readonly<{
  source: 'camera' | 'library';
  /** Lets the user choose several photos at once (`library` only). */
  multiple?: boolean;
  /** Most photos the library returns when `multiple` is on; `0` means no limit. */
  limit?: number;
}>;

/** The last path segment of a URI, decoded; used when the OS reports no file name. */
function nameFromUri(uri: string, fallback: string): string {
  const last = uri.split(/[?#]/)[0]?.split('/').pop();
  if (last === undefined || last === '') {
    return fallback;
  }
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function fromDocument(response: DocumentPickerResponse): PickedFile {
  return {
    uri: response.uri,
    name: response.name ?? nameFromUri(response.uri, 'file'),
    type: response.type ?? FALLBACK_TYPE,
    size: response.size ?? 0,
  };
}

function fromAsset(asset: Asset): PickedFile | null {
  if (asset.uri === undefined) {
    return null;
  }
  return {
    uri: asset.uri,
    name: asset.fileName ?? nameFromUri(asset.uri, 'photo.jpg'),
    type: asset.type ?? FALLBACK_IMAGE_TYPE,
    size: asset.fileSize ?? 0,
  };
}

/**
 * Opens the system file browser. Returns the chosen files, or an empty list when the user cancels.
 * Throws a `FilePickError` when the browser cannot be shown.
 */
export async function pickDocument({
  accept,
  multiple: isMultiple = false,
}: PickDocumentOptions = {}): Promise<PickedFile[]> {
  try {
    const responses = await pick({
      type: accept === undefined || accept.length === 0 ? undefined : [...accept],
      allowMultiSelection: isMultiple,
    });
    return responses.map(fromDocument);
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      (error.code === errorCodes.OPERATION_CANCELED || error.code === errorCodes.IN_PROGRESS)
    ) {
      return [];
    }
    throw new FilePickError('unknown', error);
  }
}

function toImageFiles(response: ImagePickerResponse): PickedFile[] {
  if (response.didCancel === true) {
    return [];
  }
  if (response.errorCode === 'camera_unavailable') {
    throw new FilePickError('cameraUnavailable');
  }
  if (response.errorCode === 'permission') {
    throw new FilePickError('permissionDenied');
  }
  if (response.errorCode !== undefined) {
    throw new FilePickError('unknown', response.errorMessage);
  }
  return (response.assets ?? []).flatMap((asset) => fromAsset(asset) ?? []);
}

/**
 * Takes a photo with the camera or chooses photos from the library. Returns the files, or an empty
 * list when the user cancels. Throws a `FilePickError` when the camera is missing, the permission
 * was denied, or the picker failed.
 */
export async function pickImage({
  source,
  multiple: isMultiple = false,
  limit = 0,
}: PickImageOptions): Promise<PickedFile[]> {
  try {
    const response =
      source === 'camera'
        ? await launchCamera({ mediaType: 'photo' })
        : await launchImageLibrary({
            mediaType: 'photo',
            selectionLimit: isMultiple ? limit : 1,
          });
    return toImageFiles(response);
  } catch (error) {
    throw error instanceof FilePickError ? error : new FilePickError('unknown', error);
  }
}
