// Fails when a runtime dependency of package.json has no ownership entry (owned, free or native).
// The policy is the template's DEPENDENCY_POLICY plus the project's `dependencies` in eslint.config.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEPENDENCY_POLICY, findPolicyEntry } from '@rn-tempo/eslint-config';

/** The runtime dependencies that the policy does not classify, sorted. */
export function findUnclassified(dependencyNames, policy) {
  return dependencyNames.filter((name) => !findPolicyEntry(policy, name)).sort();
}

/** The message printed for unclassified dependencies. */
export function describeUnclassified(names) {
  return [
    `${names.length} runtime ${names.length === 1 ? 'dependency has' : 'dependencies have'} no ownership entry:`,
    ...names.map((name) => `  - ${name}`),
    '',
    "Add each one to `dependencies` in eslint.config.mjs as 'owned' (with owners and a message),",
    "'free' (with a reason) or 'native' (with a reason). See docs: standards/lint-rules.",
  ].join('\n');
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { dependencies = {} } = await import(pathToFileURL(join(root, 'eslint.config.mjs')).href);
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const names = findUnclassified(Object.keys(packageJson.dependencies ?? {}), {
    ...DEPENDENCY_POLICY,
    ...dependencies,
  });
  if (names.length > 0) {
    console.error(describeUnclassified(names));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
