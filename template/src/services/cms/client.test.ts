import { ENV } from '@config/env';

import { getCmsClient } from './client';
import { sanityClient } from './sanity';
import { tempoClient } from './tempo';

test.each([
  ['tempo', tempoClient],
  ['sanity', sanityClient],
] as const)('AC-C-1: selects the %s adapter', (provider, expected) => {
  const setting = jest.replaceProperty(ENV, 'CMS_PROVIDER', provider);
  try {
    expect(getCmsClient()).toBe(expected);
  } finally {
    setting.restore();
  }
});
