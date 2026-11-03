import type { IconName } from '@assets/generated/icons.types';

/**
 * Icons that `yarn icons:prune` (release builds) must keep even though no string literal in `src`
 * names them, for example a name built at runtime: `` `flag-${code}` ``. List each name here.
 */
export const ICON_KEEP: readonly IconName[] = [];
