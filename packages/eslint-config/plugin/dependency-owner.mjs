import { matchesAny, relativeFilename } from './scope.mjs';

/** Files that may import anything: tests, test support, mocks and stories. */
export const OWNERSHIP_EXEMPT_FILES = [
  '**/*.test.{ts,tsx}',
  '**/*.stories.tsx',
  'src/test-utils/**',
  'jest.setup.ts',
  '**/__mocks__/**',
];

/** `@scope/pkg/sub` -> `@scope/pkg`; `pkg/sub` -> `pkg`; relative, alias-less node: and URL specifiers -> undefined. */
export function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return undefined;
  }
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  }
  return parts[0];
}

/** Finds the policy entry of a package: an exact key wins over a wildcard key (`@scope/*`, `jest-*`). */
export function findPolicyEntry(policy, name) {
  if (Object.hasOwn(policy, name)) {
    return policy[name];
  }
  const wildcard = Object.keys(policy).find(
    (key) => key.endsWith('*') && name.startsWith(key.slice(0, -1)),
  );
  return wildcard === undefined ? undefined : policy[wildcard];
}

/** The text shown for a violation: the entry's guidance plus where the package is allowed. */
export function ownershipMessage(name, entry) {
  const where = entry.owners?.length ? ` Allowed only in: ${entry.owners.join(', ')}.` : '';
  const why = entry.kind === 'native' ? (entry.message ?? entry.reason) : entry.message;
  return `Do not import '${name}' here. ${why}${where}`;
}

const stringValue = (node) =>
  node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;

export const dependencyOwner = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Each runtime dependency is imported only from the files that own it (see DEPENDENCY_POLICY).',
    },
    schema: [{ type: 'object' }],
    messages: { notOwner: '{{message}}' },
  },
  create(context) {
    const relativePath = relativeFilename(context);
    if (matchesAny(OWNERSHIP_EXEMPT_FILES, relativePath)) {
      return {};
    }
    const policy = context.options[0] ?? {};

    const check = (node, specifier) => {
      if (specifier === undefined) {
        return;
      }
      const name = packageName(specifier);
      const entry = name === undefined ? undefined : findPolicyEntry(policy, name);
      if (!entry || entry.kind === 'free') {
        return;
      }
      if (entry.owners && matchesAny(entry.owners, relativePath)) {
        return;
      }
      context.report({
        node,
        messageId: 'notOwner',
        data: { message: ownershipMessage(name, entry) },
      });
    };

    const fromSource = (node) => check(node.source, stringValue(node.source));
    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: (node) => node.source && fromSource(node),
      ExportAllDeclaration: fromSource,
      ImportExpression: (node) => check(node.source, stringValue(node.source)),
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node.arguments[0], stringValue(node.arguments[0]));
        }
      },
    };
  },
};
