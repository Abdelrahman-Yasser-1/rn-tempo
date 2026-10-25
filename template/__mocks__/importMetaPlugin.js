// Babel plugin used only by Jest for ESM-only packages (see jest.config.js).
// Rewrites `import.meta.url` to the CommonJS equivalent, which Babel's preset-env leaves untouched.
module.exports = function importMetaPlugin({ types: t }) {
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name !== 'import' || path.node.property.name !== 'meta') {
          return;
        }
        // import.meta -> { url: require('node:url').pathToFileURL(__filename).href }
        const url = t.memberExpression(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.identifier('require'), [t.stringLiteral('node:url')]),
              t.identifier('pathToFileURL'),
            ),
            [t.identifier('__filename')],
          ),
          t.identifier('href'),
        );
        path.replaceWith(t.objectExpression([t.objectProperty(t.identifier('url'), url)]));
      },
    },
  };
};
