import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { availableSources } from '@services/files/fileRules';
import { pickDocument, pickImage } from '@services/files/files';
import { FilePickError, type FileSource } from '@services/files/types';
import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';
import { useLatest } from '@shared/hooks';

import type { UseFileSourceSheetOptions } from './types';

/**
 * Logic shared by the single and multiple file pickers: the sheet's open state and the native
 * picker. The native picker opens only after the sheet has finished dismissing, because iOS
 * cannot present a view controller over a sheet that is still animating away.
 */
export function useFileSourceSheet({
  accept,
  multiple: isMultiple = false,
  limit,
  onPicked,
}: UseFileSourceSheetOptions) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const pendingRef = useRef<FileSource | undefined>(undefined);
  // The picker resolves long after the render that started it; read the newest handler.
  const latestOnPicked = useLatest(onPicked);

  const showError = (error: unknown) => {
    const code = error instanceof FilePickError ? error.code : 'unknown';
    if (code === 'permissionDenied') {
      toast.show({
        type: 'error',
        title: t(($) => $.filePicker.permissionDenied),
        actions: [
          {
            label: t(($) => $.filePicker.openSettings),
            onPress: () => {
              void openSettings();
            },
          },
        ],
      });
    } else {
      toast.error(
        code === 'cameraUnavailable'
          ? t(($) => $.filePicker.cameraUnavailable)
          : t(($) => $.filePicker.failed),
      );
    }
  };

  const pickFrom = async (source: FileSource) => {
    setIsPicking(true);
    try {
      const files =
        source === 'files'
          ? await pickDocument({ accept, multiple: isMultiple })
          : await pickImage({ source, multiple: isMultiple, limit });
      if (files.length > 0) {
        latestOnPicked.current(files);
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsPicking(false);
    }
  };

  const onClose = () => {
    setIsOpen(false);
    const source = pendingRef.current;
    pendingRef.current = undefined;
    if (source !== undefined) {
      void pickFrom(source);
    }
  };

  return {
    isOpen,
    isPicking,
    sources: availableSources(accept),
    onOpen: () => {
      setIsOpen(true);
    },
    onSelect: (source: FileSource) => {
      pendingRef.current = source;
      setIsOpen(false);
    },
    onClose,
  };
}
