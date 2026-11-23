import { useState } from 'react';

import {
  defaultBackendUrl,
  isApiSource,
  readApiSource,
  readBackendUrl,
  writeApiSource,
  writeBackendUrl,
  type ApiSource,
} from '@services/http/apiSource';

/** Logic of the debug menu's "API source" controls: the stored source and the backend URL. Changes apply after a restart. */
export function useApiSourceControls() {
  const [source, setSource] = useState<ApiSource>(() => readApiSource());
  const [url, setUrl] = useState(() => readBackendUrl());
  const [isSaved, setIsSaved] = useState(false);

  const onSourceChange = (value: string): void => {
    if (!isApiSource(value)) {
      return;
    }
    writeApiSource(value);
    setSource(value);
    setIsSaved(true);
  };

  const onUrlSave = (): void => {
    writeBackendUrl(url);
    setUrl(readBackendUrl());
    setIsSaved(true);
  };

  const onUrlReset = (): void => {
    writeBackendUrl('');
    setUrl(defaultBackendUrl());
    setIsSaved(true);
  };

  return {
    source,
    url,
    isSaved,
    defaultUrl: defaultBackendUrl(),
    onSourceChange,
    onUrlChange: setUrl,
    onUrlSave,
    onUrlReset,
  };
}
