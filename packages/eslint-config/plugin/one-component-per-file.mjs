const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const WRAPPERS = new Set(['memo', 'forwardRef']);
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** True when the subtree contains a JSX element or fragment. */
function containsJsx(node, visitorKeys, seen = new Set()) {
  if (!node || typeof node.type !== 'string' || seen.has(node)) {
    return false;
  }
  seen.add(node);
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return true;
  }
  return (visitorKeys[node.type] ?? []).some((key) => {
    const child = node[key];
    return Array.isArray(child)
      ? child.some((item) => containsJsx(item, visitorKeys, seen))
      : containsJsx(child, visitorKeys, seen);
  });
}

/** `memo(() => ...)` and `forwardRef(function ...)` count as the wrapped function. */
function unwrapComponent(init) {
  if (!init) {
    return undefined;
  }
  if (FUNCTION_TYPES.has(init.type)) {
    return init;
  }
  const callee = init.type === 'CallExpression' ? init.callee : undefined;
  const calleeName = callee?.type === 'MemberExpression' ? callee.property.name : callee?.name;
  return WRAPPERS.has(calleeName) ? unwrapComponent(init.arguments[0]) : undefined;
}

/** The `{ name, node }` pairs of the PascalCase functions declared by a top-level statement. */
function declaredFunctions(statement) {
  const declaration =
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
      ? statement.declaration
      : statement;
  if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
    return [{ name: declaration.id.name, node: declaration.id, body: declaration }];
  }
  if (declaration?.type !== 'VariableDeclaration') {
    return [];
  }
  return declaration.declarations.flatMap((declarator) => {
    const body = unwrapComponent(declarator.init);
    return declarator.id.type === 'Identifier' && body
      ? [{ name: declarator.id.name, node: declarator.id, body }]
      : [];
  });
}

export const oneComponentPerFile = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'A file declares one React component; extract the others into their own files.',
    },
    schema: [],
    messages: {
      extra:
        "'{{name}}' is a second component in this file. Give every component its own file (and folder).",
    },
  },
  create(context) {
    const { visitorKeys } = context.sourceCode;
    return {
      Program(program) {
        const components = program.body
          .flatMap(declaredFunctions)
          .filter(
            ({ name, body }) => PASCAL_CASE.test(name) && containsJsx(body.body, visitorKeys),
          );
        for (const { name, node } of components.slice(1)) {
          context.report({ node, messageId: 'extra', data: { name } });
        }
      },
    };
  },
};
