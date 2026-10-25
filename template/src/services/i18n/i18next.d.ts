import 'i18next';

import type { DEFAULT_NAMESPACE, resources } from './resources';

declare module 'i18next' {
  // Module augmentation needs `interface`; it types `t()` keys from the English resources.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required by i18next typing contract
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: (typeof resources)['en'];
  }
}
