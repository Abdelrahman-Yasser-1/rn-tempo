import { inScope, relativeFilename } from './scope.mjs';

const entrySchema = {
  type: 'object',
  properties: {
    selector: { type: 'string' },
    message: { type: 'string' },
    files: { type: 'array', items: { type: 'string' }, minItems: 1 },
    ignores: { type: 'array', items: { type: 'string' } },
  },
  required: ['selector', 'message'],
  additionalProperties: false,
};

/**
 * Builds a scoped replacement for core `no-restricted-syntax`. Every entry carries its own
 * `files`/`ignores` globs (relative to the ESLint cwd), so entries from different config blocks
 * never overwrite one another. Two entries with the same selector both report.
 * @param {{ description: string }} meta
 */
export function createScopedSyntaxRule({ description }) {
  return {
    meta: {
      type: 'suggestion',
      docs: { description },
      schema: { type: 'array', items: entrySchema, uniqueItems: false },
      messages: { restricted: '{{message}}' },
    },
    create(context) {
      const relativePath = relativeFilename(context);
      const handlers = new Map();
      for (const entry of context.options) {
        if (!inScope(entry, relativePath)) {
          continue;
        }
        const list = handlers.get(entry.selector) ?? [];
        list.push(entry.message);
        handlers.set(entry.selector, list);
      }
      return Object.fromEntries(
        [...handlers].map(([selector, messages]) => [
          selector,
          (node) => {
            for (const message of messages) {
              context.report({ node, messageId: 'restricted', data: { message } });
            }
          },
        ]),
      );
    },
  };
}

export const restrictedSyntax = createScopedSyntaxRule({
  description:
    'Disallow syntax by selector, with a per-entry file scope (error severity is set by the config).',
});
export const discouragedSyntax = createScopedSyntaxRule({
  description:
    'Same as restricted-syntax; configured as a warning for syntax that needs a reviewer decision.',
});
