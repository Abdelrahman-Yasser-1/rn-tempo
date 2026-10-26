import { http, HttpResponse } from 'msw';

/** Mock-only endpoint (contract C13): nothing blocks, no flag overrides. */
export const mockAppConfig = {
  minSupportedVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '1.0.0', android: '1.0.0' },
  maintenance: { enabled: false },
  flags: {},
  storeUrls: {
    ios: 'https://apps.apple.com/app/id0000000000',
    android: 'https://play.google.com/store/apps/details?id=com.rntempo.app',
  },
};

export const appConfigHandlers = [http.get('*/app-config', () => HttpResponse.json(mockAppConfig))];
