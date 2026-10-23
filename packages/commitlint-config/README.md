# @rn-tempo/commitlint-config

Shared [commitlint](https://commitlint.js.org) config for RN-TEMPO projects.

- Conventional Commits types: `feat fix docs style refactor perf test build ci chore revert`
- A scope is required and must be in the shared list (see `index.mjs`) or added by the project
- Header ≤ 100 characters
- `ai-session-trailer`: a commit with `AI-Assisted:` must also have `AI-Session: .ai/sessions/<file>.md`, and that file must exist

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
