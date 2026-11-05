import { act, renderHook } from '@testing-library/react-native';

import { pickDocument, pickImage } from '@services/files/files';
import { FilePickError, type PickedFile } from '@services/files/types';
import { initI18nInstance } from '@services/i18n/i18n';
import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';

import { useFileSourceSheet } from './useFileSourceSheet';

jest.mock('@services/files/files');
jest.mock('@services/linking/linking', () => ({
  openSettings: jest.fn(() => Promise.resolve(true)),
}));

const mockedDocument = jest.mocked(pickDocument);
const mockedImage = jest.mocked(pickImage);
const file: PickedFile = { uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf', size: 1 };

beforeAll(async () => {
  await initI18nInstance('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(toast, 'show').mockImplementation(jest.fn());
  jest.spyOn(toast, 'error').mockImplementation(jest.fn());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useFileSourceSheet', () => {
  it('offers the sources that fit the accepted types', async () => {
    const { result: everything } = await renderHook(() =>
      useFileSourceSheet({ onPicked: jest.fn() }),
    );
    const { result: pdfOnly } = await renderHook(() =>
      useFileSourceSheet({ accept: ['application/pdf'], onPicked: jest.fn() }),
    );

    expect(everything.current.sources).toEqual(['camera', 'library', 'files']);
    expect(pdfOnly.current.sources).toEqual(['files']);
  });

  it('opens the native picker only after the sheet has dismissed', async () => {
    mockedDocument.mockResolvedValue([file]);
    const onPicked = jest.fn();
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked }));

    await act(() => {
      result.current.onOpen();
    });
    expect(result.current.isOpen).toBe(true);
    await act(() => {
      result.current.onSelect('files');
    });

    expect(result.current.isOpen).toBe(false);
    expect(mockedDocument).not.toHaveBeenCalled();

    await act(() => {
      result.current.onClose();
    });

    expect(mockedDocument).toHaveBeenCalledWith({ accept: undefined, multiple: false });
    expect(onPicked).toHaveBeenCalledWith([file]);
    expect(result.current.isPicking).toBe(false);
  });

  it('picks nothing when the sheet is dismissed without a choice', async () => {
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked: jest.fn() }));

    await act(() => {
      result.current.onOpen();
    });
    await act(() => {
      result.current.onClose();
    });

    expect(result.current.isOpen).toBe(false);
    expect(mockedDocument).not.toHaveBeenCalled();
    expect(mockedImage).not.toHaveBeenCalled();
  });

  it('picks only once per choice', async () => {
    mockedImage.mockResolvedValue([file]);
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked: jest.fn() }));

    await act(() => {
      result.current.onSelect('camera');
    });
    await act(() => {
      result.current.onClose();
    });
    await act(() => {
      result.current.onClose();
    });

    expect(mockedImage).toHaveBeenCalledTimes(1);
  });

  it.each(['camera', 'library'] as const)(
    'forwards multiple and limit to the %s',
    async (source) => {
      mockedImage.mockResolvedValue([file]);
      const { result } = await renderHook(() =>
        useFileSourceSheet({ multiple: true, limit: 3, onPicked: jest.fn() }),
      );

      await act(() => {
        result.current.onSelect(source);
      });
      await act(() => {
        result.current.onClose();
      });

      expect(mockedImage).toHaveBeenCalledWith({ source, multiple: true, limit: 3 });
    },
  );

  it('forwards the accepted types and multiple to the file browser', async () => {
    mockedDocument.mockResolvedValue([file]);
    const { result } = await renderHook(() =>
      useFileSourceSheet({ accept: ['application/pdf'], multiple: true, onPicked: jest.fn() }),
    );

    await act(() => {
      result.current.onSelect('files');
    });
    await act(() => {
      result.current.onClose();
    });

    expect(mockedDocument).toHaveBeenCalledWith({ accept: ['application/pdf'], multiple: true });
  });

  it('does not report a cancelled pick', async () => {
    mockedDocument.mockResolvedValue([]);
    const onPicked = jest.fn();
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked }));

    await act(() => {
      result.current.onSelect('files');
    });
    await act(() => {
      result.current.onClose();
    });

    expect(onPicked).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('calls the newest onPicked handler', async () => {
    let resolvePick: (files: PickedFile[]) => void = jest.fn();
    mockedDocument.mockReturnValue(
      new Promise((resolve) => {
        resolvePick = resolve;
      }),
    );
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = await renderHook(
      (props: { onPicked: (files: readonly PickedFile[]) => void }) => useFileSourceSheet(props),
      { initialProps: { onPicked: first } },
    );

    await act(() => {
      result.current.onSelect('files');
    });
    await act(() => {
      result.current.onClose();
    });
    expect(result.current.isPicking).toBe(true);
    await rerender({ onPicked: second });
    await act(() => {
      resolvePick([file]);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith([file]);
  });

  it('toasts a permission error with an Open settings action', async () => {
    mockedImage.mockRejectedValue(new FilePickError('permissionDenied'));
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked: jest.fn() }));

    await act(() => {
      result.current.onSelect('camera');
    });
    await act(() => {
      result.current.onClose();
    });

    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Allow access in Settings to use the camera or your photos.',
        actions: [expect.objectContaining({ label: 'Open settings' })],
      }),
    );
    const [options] = jest.mocked(toast.show).mock.calls[0] ?? [];
    options?.actions?.[0]?.onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(result.current.isPicking).toBe(false);
  });

  it.each([
    [new FilePickError('cameraUnavailable'), 'No camera is available on this device.'],
    [new FilePickError('unknown'), 'Could not get the file. Try again.'],
    [new Error('not a pick error'), 'Could not get the file. Try again.'],
  ])('toasts %s', async (error, message) => {
    mockedImage.mockRejectedValue(error);
    const { result } = await renderHook(() => useFileSourceSheet({ onPicked: jest.fn() }));

    await act(() => {
      result.current.onSelect('camera');
    });
    await act(() => {
      result.current.onClose();
    });

    expect(toast.error).toHaveBeenCalledWith(message);
    expect(toast.show).not.toHaveBeenCalled();
  });
});
