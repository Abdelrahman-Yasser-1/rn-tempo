import { ENV } from '@config/env';

import { sanityClient } from './sanity';
import { tempoClient } from './tempo';
import type { CmsClient } from './types';

/** Selects the public reader configured for this build. */
export function getCmsClient(): CmsClient {
  return { tempo: tempoClient, sanity: sanityClient }[ENV.CMS_PROVIDER];
}
