// Where the tempo adapter reads content from: the API's resolved base (so the dev menu's backend choice applies) unless
// CMS_BASE_URL is set to something else.
import type * as EnvModule from '@config/env';
import type * as HttpClientModule from '@services/http/client';

import type * as TempoModule from './tempo';

const mockResolveBaseUrl = jest.fn(() => 'https://backend.example.test');

jest.mock('@services/http/client', () => ({
  ...jest.requireActual<typeof HttpClientModule>('@services/http/client'),
  resolveBaseUrl: () => mockResolveBaseUrl(),
}));

const mockEnv = {
  API_BASE_URL: 'https://api.example.test',
  CMS_BASE_URL: 'https://api.example.test',
};

jest.mock('@config/env', () => ({
  ...jest.requireActual<typeof EnvModule>('@config/env'),
  get ENV() {
    return { ...jest.requireActual<typeof EnvModule>('@config/env').ENV, ...mockEnv };
  },
}));

describe('contentBaseUrl', () => {
  test('follows the resolved API base when CMS_BASE_URL is not set on its own', () => {
    const { contentBaseUrl } = jest.requireActual<typeof TempoModule>('./tempo');
    expect(contentBaseUrl()).toBe('https://backend.example.test');
  });

  test('uses an explicit CMS_BASE_URL', () => {
    mockEnv.CMS_BASE_URL = 'https://cms.example.test/api/v1';
    const { contentBaseUrl } = jest.requireActual<typeof TempoModule>('./tempo');
    expect(contentBaseUrl()).toBe('https://cms.example.test/api/v1');
    expect(mockResolveBaseUrl).toHaveBeenCalledTimes(1);
  });
});
