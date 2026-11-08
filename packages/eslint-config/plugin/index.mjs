import { dependencyOwner } from './dependency-owner.mjs';
import { oneComponentPerFile } from './one-component-per-file.mjs';
import { discouragedSyntax, restrictedSyntax } from './restricted-syntax.mjs';

/** The local ESLint plugin of RN-TEMPO; registered as `rn-tempo`. */
export const rnTempoPlugin = {
  meta: { name: 'rn-tempo' },
  rules: {
    'restricted-syntax': restrictedSyntax,
    'discouraged-syntax': discouragedSyntax,
    'dependency-owner': dependencyOwner,
    'one-component-per-file': oneComponentPerFile,
  },
};

export { OWNERSHIP_EXEMPT_FILES } from './dependency-owner.mjs';
