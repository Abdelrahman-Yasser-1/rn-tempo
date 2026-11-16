import { defineEndpoint } from '@rn-tempo/api-contract';

import { AppConfigSchema } from '@services/remote-config/appConfig';

/** Mock-only endpoint (contract C13): nothing blocks, no flag overrides. */
export const MOCK_APP_CONFIG = {
  minSupportedVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '1.0.0', android: '1.0.0' },
  maintenance: { enabled: false },
  flags: {},
  storeUrls: {
    ios: 'https://apps.apple.com/app/id0000000000',
    android: 'https://play.google.com/store/apps/details?id=com.rntempo.app',
  },
};

export const getAppConfig = defineEndpoint({
  method: 'GET',
  path: '/app-config',
  summary: 'Remote app configuration',
  tags: ['app-config'],
  response: AppConfigSchema,
  data: () => MOCK_APP_CONFIG,
});
