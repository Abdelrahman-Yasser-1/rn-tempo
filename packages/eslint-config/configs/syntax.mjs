import { rnTempoPlugin } from '../plugin/index.mjs';

import { ENUM_ENTRIES } from './base.mjs';
import { CHEAP_BAN_ENTRIES } from './bans.mjs';
import { IMPORT_ENTRIES, LOGICAL_PROPERTY_ENTRIES } from './restrictions.mjs';
import { TEST_ENTRIES } from './tests.mjs';

/** Entries reported as errors. Each carries its own `files`/`ignores`, so the order does not matter. */
export const RESTRICTED_SYNTAX_ENTRIES = [
  ...ENUM_ENTRIES,
  ...IMPORT_ENTRIES,
  ...LOGICAL_PROPERTY_ENTRIES,
  ...CHEAP_BAN_ENTRIES,
];

/** Entries reported as warnings (a reviewer decides). */
export const DISCOURAGED_SYNTAX_ENTRIES = [...TEST_ENTRIES];

/**
 * The single block that configures `rn-tempo/restricted-syntax` and `rn-tempo/discouraged-syntax`.
 * Flat config is last-wins per rule, so these two rules are set here and nowhere else; the core
 * `no-restricted-syntax` and `no-restricted-imports` are left unset on purpose.
 */
export function syntaxConfig() {
  return [
    {
      name: 'rn-tempo/syntax',
      plugins: { 'rn-tempo': rnTempoPlugin },
      rules: {
        'rn-tempo/restricted-syntax': ['error', ...RESTRICTED_SYNTAX_ENTRIES],
        'rn-tempo/discouraged-syntax': ['warn', ...DISCOURAGED_SYNTAX_ENTRIES],
      },
    },
  ];
}
