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

  test('returns an empty list while another pick is in progress', async () => {
    mockedPick.mockRejectedValue({ code: errorCodes.IN_PROGRESS });

    await expect(pickDocument()).resolves.toEqual([]);
  });

  test('wraps other failures in a FilePickError', async () => {
    mockedPick.mockRejectedValue(new Error('boom'));

    await expect(pickDocument()).rejects.toMatchObject({ code: 'unknown' });
  });

  test('wraps a coded failure that is not a cancel and keeps the cause', async () => {
    const cause = { code: errorCodes.NULL_PRESENTER };
    mockedPick.mockRejectedValue(cause);

    const error: unknown = await pickDocument().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FilePickError);
    expect(error).toMatchObject({ code: 'unknown', cause });
  });

  test('asks for every file type and a single file by default', async () => {
    mockedPick.mockResolvedValue([] as never);

    await pickDocument();
    await pickDocument({ accept: [] });

    expect(mockedPick).toHaveBeenNthCalledWith(1, {
      type: undefined,
      allowMultiSelection: false,
    });
    expect(mockedPick).toHaveBeenNthCalledWith(2, {
      type: undefined,
      allowMultiSelection: false,
    });
  });

  test('derives the name from the URI without its query string', async () => {
    mockedPick.mockResolvedValue([
      { uri: 'file:///tmp/a%20b.png?x=1#top', name: null, type: 'image/png', size: 5 },
    ] as never);

    await expect(pickDocument()).resolves.toEqual([
      { uri: 'file:///tmp/a%20b.png?x=1#top', name: 'a b.png', type: 'image/png', size: 5 },
    ]);
  });

  test('keeps a raw name when the URI cannot be decoded and uses "file" for a bare URI', async () => {
    mockedPick.mockResolvedValue([
      { uri: 'file:///tmp/100%.txt', name: null, type: null, size: null },
      { uri: 'file:///tmp/', name: null, type: null, size: null },
    ] as never);

    const files = await pickDocument({ multiple: true });

    expect(files.map((file) => file.name)).toEqual(['100%.txt', 'file']);
  });

  test('returns every file of a multiple selection', async () => {
    mockedPick.mockResolvedValue([response, { ...response, uri: 'file:///tmp/b.pdf' }] as never);

    await expect(pickDocument({ multiple: true })).resolves.toHaveLength(2);
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

  test('returns an empty list when the camera is cancelled', async () => {
    mockedCamera.mockResolvedValue({ didCancel: true });

    await expect(pickImage({ source: 'camera' })).resolves.toEqual([]);
  });

  test('forwards multiple and limit to the library, and no limit means unlimited', async () => {
    mockedLibrary.mockResolvedValue({ assets: [] });

    await pickImage({ source: 'library', multiple: true });
    await pickImage({ source: 'library', multiple: false, limit: 5 });

    expect(mockedLibrary).toHaveBeenNthCalledWith(1, { mediaType: 'photo', selectionLimit: 0 });
    expect(mockedLibrary).toHaveBeenNthCalledWith(2, { mediaType: 'photo', selectionLimit: 1 });
    expect(mockedCamera).not.toHaveBeenCalled();
  });

  test('falls back when the asset has no name, type or size, and drops assets without a URI', async () => {
    mockedLibrary.mockResolvedValue({
      assets: [{ uri: 'file:///tmp/IMG_1.heic' }, { fileName: 'ghost.jpg' }, {}],
    });

    await expect(pickImage({ source: 'library', multiple: true })).resolves.toEqual([
      { uri: 'file:///tmp/IMG_1.heic', name: 'IMG_1.heic', type: 'image/jpeg', size: 0 },
    ]);
  });

  test('uses photo.jpg when the URI has no file name', async () => {
    mockedLibrary.mockResolvedValue({ assets: [{ uri: 'ph://' }] });

    const [file] = await pickImage({ source: 'library' });

    expect(file?.name).toBe('photo.jpg');
  });

  test('returns an empty list when the response has no assets', async () => {
    mockedLibrary.mockResolvedValue({});

    await expect(pickImage({ source: 'library' })).resolves.toEqual([]);
  });

  test('keeps the native error message as the cause of an unknown error', async () => {
    mockedCamera.mockResolvedValue({ errorCode: 'others', errorMessage: 'disk full' });

    await expect(pickImage({ source: 'camera' })).rejects.toMatchObject({
      code: 'unknown',
      cause: 'disk full',
    });
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
