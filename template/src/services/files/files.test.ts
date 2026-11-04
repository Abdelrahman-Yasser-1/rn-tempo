import { errorCodes, pick } from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import { pickDocument, pickImage } from './files';
import { FilePickError } from './types';

const mockedPick = jest.mocked(pick);
const mockedCamera = jest.mocked(launchCamera);
const mockedLibrary = jest.mocked(launchImageLibrary);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickDocument', () => {
  const response = {
    uri: 'file:///tmp/report.pdf',
    name: 'report.pdf',
    type: 'application/pdf',
    size: 2048,
  };

  test('maps the picked documents and passes the accepted types', async () => {
    mockedPick.mockResolvedValue([response] as never);

    await expect(pickDocument({ accept: ['application/pdf'], multiple: true })).resolves.toEqual([
      { uri: 'file:///tmp/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 2048 },
    ]);
    expect(mockedPick).toHaveBeenCalledWith({
      type: ['application/pdf'],
      allowMultiSelection: true,
    });
  });

  test('falls back when the OS reports no name, type or size', async () => {
    mockedPick.mockResolvedValue([
      { uri: 'content://docs/My%20File.txt', name: null, type: null, size: null },
    ] as never);

    await expect(pickDocument()).resolves.toEqual([
      {
        uri: 'content://docs/My%20File.txt',
        name: 'My File.txt',
        type: 'application/octet-stream',
        size: 0,
      },
    ]);
  });

  test('returns an empty list when the user cancels', async () => {
    mockedPick.mockRejectedValue({ code: errorCodes.OPERATION_CANCELED });

    await expect(pickDocument()).resolves.toEqual([]);
  });

  test('wraps other failures in a FilePickError', async () => {
    mockedPick.mockRejectedValue(new Error('boom'));

    await expect(pickDocument()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('pickImage', () => {
  const asset = { uri: 'file:///tmp/p.jpg', fileName: 'p.jpg', type: 'image/jpeg', fileSize: 10 };

  test('takes a photo with the camera', async () => {
    mockedCamera.mockResolvedValue({ assets: [asset] });

    await expect(pickImage({ source: 'camera' })).resolves.toEqual([
      { uri: 'file:///tmp/p.jpg', name: 'p.jpg', type: 'image/jpeg', size: 10 },
    ]);
    expect(mockedCamera).toHaveBeenCalledWith({ mediaType: 'photo' });
  });

  test('limits the library to one photo unless several are allowed', async () => {
    mockedLibrary.mockResolvedValue({ assets: [asset] });

    await pickImage({ source: 'library' });
    await pickImage({ source: 'library', multiple: true, limit: 3 });

    expect(mockedLibrary).toHaveBeenNthCalledWith(1, { mediaType: 'photo', selectionLimit: 1 });
    expect(mockedLibrary).toHaveBeenNthCalledWith(2, { mediaType: 'photo', selectionLimit: 3 });
  });

  test('returns an empty list when the user cancels', async () => {
    mockedLibrary.mockResolvedValue({ didCancel: true });

    await expect(pickImage({ source: 'library' })).resolves.toEqual([]);
  });

  test.each([
    ['camera_unavailable', 'cameraUnavailable'],
    ['permission', 'permissionDenied'],
    ['others', 'unknown'],
  ] as const)('maps the %s error to %s', async (errorCode, code) => {
    mockedCamera.mockResolvedValue({ errorCode });

    const error: unknown = await pickImage({ source: 'camera' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FilePickError);
    expect(error).toMatchObject({ code });
  });

  test('wraps a thrown native error', async () => {
    mockedLibrary.mockRejectedValue(new Error('native'));

    await expect(pickImage({ source: 'library' })).rejects.toMatchObject({ code: 'unknown' });
  });
});
