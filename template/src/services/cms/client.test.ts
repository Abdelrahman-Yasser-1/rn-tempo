import { ENV } from '@config/env';

import { getCmsClient } from './client';

test.each(['tempo', 'sanity'] as const)(
  'AC-C-1: selects the %s adapter for list and single reads',
  async (provider) => {
    const original = ENV.CMS_PROVIDER;
    try {
      ENV.CMS_PROVIDER = provider;
      const client = getCmsClient();
      const error = new RegExp(provider + ' adapter is not implemented');
      await expect(client.getEntries('announcement', { locale: 'en' })).rejects.toThrow(error);
      await expect(client.getEntry('announcement', 'news', { locale: 'en' })).rejects.toThrow(
        error,
      );
    } finally {
      ENV.CMS_PROVIDER = original;
    }
  },
);
