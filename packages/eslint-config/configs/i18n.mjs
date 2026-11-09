const T_CALLEE = [
  "[callee.name='t']",
  "[callee.type='MemberExpression'][callee.object.name=/^(?:i18n|i18next)$/][callee.property.name='t']",
];

/** A call of `t()`, `i18n.t()` or `i18next.t()` whose first argument matches `argument`. */
const T_CALL = (argument) => T_CALLEE.map((callee) => `CallExpression${callee}${argument}`).join(', ');

/** i18n bans: each is one selector with its own scope. */
export const I18N_ENTRIES = [
  {
    selector: T_CALL("[arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]"),
    message:
      'No dynamic translation keys: they lose type safety and the extractor cannot see them. Map values to keys with an `as const` object.',
    files: ['src/**'],
  },
  {
    selector: T_CALL("[arguments.0.type='ArrowFunctionExpression']"),
    message:
      "Use a string key, `t('a.b')`, not the selector form `t(($) => $.a.b)`: the codebase keeps one style.",
    files: ['src/**'],
  },
];
