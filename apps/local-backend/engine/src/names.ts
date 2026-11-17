/** Collection and field names. The only text that ever becomes an SQL identifier, and it is always quoted. */
export const IDENTIFIER = /^[a-z][a-zA-Z0-9_]{0,62}$/;

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value) && !value.toLowerCase().startsWith('sqlite_');
}

/**
 * Quotes a validated identifier for SQL. It throws for anything the schema would not accept, so a name
 * that skipped validation can never reach a statement.
 */
export function quoteIdent(name: string): string {
  if (!isIdentifier(name)) throw new Error(`Invalid identifier: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

/** The unique index of a column. `:` cannot occur in an identifier, so two columns never share a name. */
export function uniqueIndexName(table: string, column: string): string {
  quoteIdent(table);
  quoteIdent(column);
  return `"ux:${table}:${column}"`;
}
