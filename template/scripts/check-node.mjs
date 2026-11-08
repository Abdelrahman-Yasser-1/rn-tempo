// Fails `yarn install` early when the running Node does not satisfy `engines.node` (Yarn 4 ignores `engines`).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Parses `>=x`, `>=x.y`, `>=x.y.z` or a plain `x` (meaning major x). Returns null for any other form. */
export function parseRange(range) {
  const match = /^\s*(?:(>=)\s*)?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(range ?? '');
  if (!match) {
    return null;
  }
  const [, operator, major, minor, patch] = match;
  if (!operator && (minor !== undefined || patch !== undefined)) {
    return null;
  }
  return {
    exactMajor: !operator,
    min: [Number(major), Number(minor ?? 0), Number(patch ?? 0)],
  };
}

function parseVersion(version) {
  return version.replace(/^v/, '').split('.').map(Number);
}

/** True when `version` satisfies a parsed range. */
export function satisfies(version, parsed) {
  const current = parseVersion(version);
  if (parsed.exactMajor) {
    return current[0] === parsed.min[0];
  }
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) !== parsed.min[index]) {
      return (current[index] ?? 0) > parsed.min[index];
    }
  }
  return true;
}

/** Returns `{ ok, errors, warnings }` for a version against `engines.node` and the `.nvmrc` content. */
export function checkNode({ version, range, nvmrc }) {
  const errors = [];
  const warnings = [];
  const parsed = parseRange(range);
  if (!parsed) {
    warnings.push(
      `Cannot check engines.node "${range}" (unsupported form); skipping the Node version check.`,
    );
  } else if (!satisfies(version, parsed)) {
    errors.push(
      `Node ${version} does not satisfy engines.node "${range}". Switch Node and retry: run \`nvm use\` (see .nvmrc).`,
    );
  }
  const wanted = nvmrc ? /\d+/.exec(nvmrc)?.[0] : undefined;
  if (wanted !== undefined && Number(wanted) !== parseVersion(version)[0]) {
    warnings.push(
      `Node ${version} differs from the major in .nvmrc (${nvmrc.trim()}); \`nvm use\` aligns them.`,
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

function readOptional(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return;
  }
}

function main() {
  if (process.env.TEMPO_SKIP_NODE_CHECK === '1') {
    return;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { engines } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!engines?.node) {
    return;
  }
  const { ok, errors, warnings } = checkNode({
    version: process.versions.node,
    range: engines.node,
    nvmrc: readOptional(join(root, '.nvmrc')),
  });
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
  if (!ok) {
    for (const error of errors) {
      console.error(`error: ${error}`);
    }
    console.error('Set TEMPO_SKIP_NODE_CHECK=1 to skip this check.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
