# @rn-tempo/commitlint-config

Shared [commitlint](https://commitlint.js.org) config for RN-TEMPO projects.

- Conventional Commits types: `feat fix docs style refactor perf test build ci chore revert`
- A scope is required and must be in the shared list (see `index.mjs`) or added by the project
- Header ≤ 100 characters
- `AI-Assisted:`, `Spec:` and legacy `AI-Session:` trailers are accepted but not required or validated (AI session logs are local only and no longer committed)

## Usage

```js
// commitlint.config.mjs
export { default } from '@rn-tempo/commitlint-config';
```

Adding project feature scopes:

```js
import { createConfig } from '@rn-tempo/commitlint-config';
export default createConfig({ extraScopes: ['wallet', 'cards'] });
```
