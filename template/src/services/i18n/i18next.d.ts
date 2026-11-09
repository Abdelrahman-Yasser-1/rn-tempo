import 'i18next';

import type { DEFAULT_NAMESPACE, resources } from './resources';

declare module 'i18next' {
  // Module augmentation needs `interface`; it types `t()` keys from the English resources.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required by i18next typing contract
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    // `true`, not `'optimize'`: the plural base keys (`count`) and `context` variants only exist in
    // the selector types in `true` mode. String keys no longer compile; use `t(($) => $.a.b)`.
    enableSelector: true;
    resources: (typeof resources)['en'];
  }
}
