/** Structural equality for form values: primitives, arrays and plain objects. */
export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && isEqual(left[key], right[key]))
    );
  }
  return false;
}

/** Deep merge for plain objects (arrays and primitives in `override` replace `base`). */
export function mergeValues<T extends object>(
  base: Partial<T> | undefined,
  override: Readonly<Record<string, unknown>> | undefined,
): Partial<T> | undefined {
  if (override === undefined) {
    return base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [name, value] of Object.entries(override)) {
    const current = result[name];
    const isObject = (item: unknown): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item);
    result[name] = isObject(current) && isObject(value) ? mergeValues(current, value) : value;
  }
  return result as Partial<T>;
}

type Container = Record<string, unknown> | unknown[];

function isContainer(node: unknown): node is Container {
  return typeof node === 'object' && node !== null;
}

function isEmptyContainer(node: unknown): boolean {
  return Array.isArray(node)
    ? node.every((item) => item === undefined)
    : isContainer(node) && Object.keys(node).length === 0;
}

function child(node: Container, key: string): unknown {
  return (node as Record<string, unknown>)[key];
}

/** A copy of `node` where `key` holds `value`, or is gone when `value` is `undefined`. */
// eslint-disable-next-line sonarjs/function-return-type -- returns the same kind of container (array or object) as `node`
function withKey(node: Container, key: string, value: unknown): Container {
  if (Array.isArray(node)) {
    const copy: unknown[] = [...node];
    copy[Number(key)] = value;
    return copy;
  }
  const entries = Object.entries(node).filter(([name]) => name !== key);
  return Object.fromEntries(value === undefined ? entries : [...entries, [key, value]]);
}

/** A copy of `node` without the value at the dotted `path`; containers left empty are dropped too. */
export function unsetPath<T>(node: T, path: string): T {
  const next = unset(node, path.split('.'));
  return (next === undefined ? {} : next) as T;
}

function unset(node: unknown, segments: readonly string[]): unknown {
  const [head, ...rest] = segments;
  if (!isContainer(node) || head === undefined || child(node, head) === undefined) {
    return node;
  }
  const next = rest.length === 0 ? undefined : unset(child(node, head), rest);
  // Arrays keep their indexes: a removed item leaves a hole, not a shift.
  const result = withKey(
    node,
    head,
    next !== undefined && isEmptyContainer(next) ? undefined : next,
  );
  return isEmptyContainer(result) ? undefined : result;
}

/** A copy of `node` with `value` at the dotted `path`, creating containers on the way. */
export function setPath<T>(node: T, path: string, value: unknown): T {
  return setIn(node, path.split('.'), value) as T;
}

function emptyContainerFor(key: string): Container {
  return /^\d+$/.test(key) ? [] : {};
}

function setIn(node: unknown, segments: readonly string[], value: unknown): unknown {
  const [head, ...rest] = segments;
  if (head === undefined) {
    return value;
  }
  const base = isContainer(node) ? node : emptyContainerFor(head);
  return withKey(base, head, setIn(child(base, head), rest, value));
}
