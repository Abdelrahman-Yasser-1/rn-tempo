import { useState } from 'react';

import {
  defaultDevApiUrl,
  isApiSource,
  readApiSource,
  readDevApiUrl,
  writeApiSource,
  writeDevApiUrl,
  type ApiSource,
} from '@services/http/apiSource';

/** Logic of the debug menu's "API source" controls: the stored source and the dev API URL. Changes apply after a restart. */
export function useApiSourceControls() {
  const [source, setSource] = useState<ApiSource>(() => readApiSource());
  const [url, setUrl] = useState(() => readDevApiUrl());
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
    writeDevApiUrl(url);
    setUrl(readDevApiUrl());
    setIsSaved(true);
  };

  const onUrlReset = (): void => {
    writeDevApiUrl('');
    setUrl(defaultDevApiUrl());
    setIsSaved(true);
  };

  return {
    source,
    url,
    isSaved,
    defaultUrl: defaultDevApiUrl(),
    onSourceChange,
    onUrlChange: setUrl,
    onUrlSave,
    onUrlReset,
  };
}
