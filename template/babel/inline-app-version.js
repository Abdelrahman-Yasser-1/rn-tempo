// Replaces the free identifier `__APP_VERSION__` with the version from package.json at build time,
// so the app knows its marketing version without bundling the whole package.json (which would ship
// the dependency list). Declared for TypeScript in src/config/globals.d.ts.
const { version } = require('../package.json');

const IDENTIFIER = '__APP_VERSION__';

module.exports = function inlineAppVersion({ types: t }) {
  return {
    name: 'inline-app-version',
    visitor: {
      Identifier(path) {
        if (
          path.node.name === IDENTIFIER &&
          path.isReferencedIdentifier() &&
          !path.scope.hasBinding(IDENTIFIER)
        ) {
          path.replaceWith(t.stringLiteral(version));
        }
      },
    },
  };
};
